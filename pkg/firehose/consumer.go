// Package firehose subscribes to the ATProto repository event stream
// (the "firehose") and decodes Bluesky post records into a typed,
// frontend-friendly shape.
//
// It is a thin, opinionated wrapper around the official indigo SDK
// (github.com/bluesky-social/indigo) that:
//
//   - dials a relay's com.atproto.sync.subscribeRepos WebSocket endpoint,
//   - hands the connection to events.HandleRepoStream with a scheduler,
//   - for each #commit, verifies the commit, walks the CAR slice, decodes
//     app.bsky.feed.post records, and fans them out to subscribers.
//
// The package is intentionally small: it owns no database. Consumers of
// the exported Subscribe channel do their own persistence/processing.
package firehose

import (
	"context"
	"fmt"
	"log/slog"
	"net/url"
	"sync"
	"time"

	comatproto "github.com/bluesky-social/indigo/api/atproto"
	"github.com/bluesky-social/indigo/atproto/atdata"
	"github.com/bluesky-social/indigo/atproto/repo"
	"github.com/bluesky-social/indigo/atproto/syntax"
	"github.com/bluesky-social/indigo/events"
	"github.com/bluesky-social/indigo/events/schedulers/parallel"
	"github.com/gorilla/websocket"

	"github.com/wesen/atproto-experiments/pkg/plugins"
)

// Post is the decoded, frontend-friendly representation of a single
// app.bsky.feed.post record as observed on the firehose.
type Post struct {
	// Did is the repository (account) that authored the post.
	Did string `json:"did"`
	// Rkey is the record key within the app.bsky.feed.post collection.
	Rkey string `json:"rkey"`
	// URI is the canonical at:// URI of the record.
	URI string `json:"uri"`
	// CID is the content hash of the record block.
	CID string `json:"cid"`
	// Text is the post body.
	Text string `json:"text"`
	// CreatedAt is the client-declared creation timestamp from the record.
	CreatedAt string `json:"createdAt"`
	// Langs is the declared human languages of the post text.
	Langs []string `json:"langs,omitempty"`
	// Tags are the author-supplied tags.
	Tags []string `json:"tags,omitempty"`
	// Action is the repo operation: "create", "update", or "delete".
	Action string `json:"action"`
	// Seq is the firehose sequence number (per-host, per-endpoint).
	Seq int64 `json:"seq"`
	// Time is the relay-side timestamp of the event.
	Time string `json:"time"`
}

// Consumer subscribes to a firehose endpoint and broadcasts decoded Posts.
type Consumer struct {
	relayURL string
	logger   *slog.Logger

	mu            sync.RWMutex
	subs          map[int]chan Post
	nextSubID     int
	lastSeq       int64

	// Plugin subscribers receive dev.atproto-demo.plugin records (see ticket
	// PLUGIN-SHARING). Separate from post subs so a plugin feed consumer
	// does not pay for post decoding, and vice versa.
	pluginSubs      map[int]chan plugins.PluginSummary
	nextPluginSubID int
}

// NewConsumer creates a Consumer for the given relay URL.
// relayURL should be an https:// URL to a relay; the scheme is rewritten
// to wss:// and the path is set to /xrpc/com.atproto.sync.subscribeRepos.
func NewConsumer(relayURL string, logger *slog.Logger) *Consumer {
	if logger == nil {
		logger = slog.Default().With("system", "firehose")
	}
	return &Consumer{
		relayURL:    relayURL,
		logger:      logger,
		subs:        make(map[int]chan Post),
		pluginSubs:  make(map[int]chan plugins.PluginSummary),
	}
}

// Subscribe registers a subscriber that receives every decoded Post.
// The returned channel is buffered; a slow consumer will be dropped.
// The returned cancel func deregisters the subscriber and closes the channel.
func (c *Consumer) Subscribe() (<-chan Post, func()) {
	c.mu.Lock()
	id := c.nextSubID
	c.nextSubID++
	ch := make(chan Post, 256)
	c.subs[id] = ch
	c.mu.Unlock()

	cancel := func() {
		c.mu.Lock()
		if ch, ok := c.subs[id]; ok {
			delete(c.subs, id)
			close(ch)
		}
		c.mu.Unlock()
	}
	return ch, cancel
}

// SubscribePlugins registers a subscriber that receives every decoded
// dev.atproto-demo.plugin record. The returned channel is buffered; a slow
// consumer is dropped. The returned cancel func deregisters and closes the
// channel.
func (c *Consumer) SubscribePlugins() (<-chan plugins.PluginSummary, func()) {
	c.mu.Lock()
	id := c.nextPluginSubID
	c.nextPluginSubID++
	ch := make(chan plugins.PluginSummary, 64)
	c.pluginSubs[id] = ch
	c.mu.Unlock()

	cancel := func() {
		c.mu.Lock()
		if ch, ok := c.pluginSubs[id]; ok {
			delete(c.pluginSubs, id)
			close(ch)
		}
		c.mu.Unlock()
	}
	return ch, cancel
}

// LastSeq returns the highest sequence number observed so far.
func (c *Consumer) LastSeq() int64 {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.lastSeq
}

func (c *Consumer) broadcast(p Post) {
	c.mu.Lock()
	if p.Seq > c.lastSeq {
		c.lastSeq = p.Seq
	}
	// snapshot subscriber channels to avoid holding the lock during sends
	chans := make([]chan Post, 0, len(c.subs))
	for _, ch := range c.subs {
		chans = append(chans, ch)
	}
	c.mu.Unlock()

	for _, ch := range chans {
		select {
		case ch <- p:
		default:
			// drop on slow consumer; do not block the firehose
		}
	}
}

// broadcastPlugin fans a decoded plugin summary out to all plugin subscribers.
func (c *Consumer) broadcastPlugin(p plugins.PluginSummary) {
	c.mu.Lock()
	if p.Seq > c.lastSeq {
		c.lastSeq = p.Seq
	}
	chans := make([]chan plugins.PluginSummary, 0, len(c.pluginSubs))
	for _, ch := range c.pluginSubs {
		chans = append(chans, ch)
	}
	c.mu.Unlock()

	for _, ch := range chans {
		select {
		case ch <- p:
		default:
			// drop on slow consumer; do not block the firehose
		}
	}
}

// Run blocks until ctx is canceled, maintaining a resilient firehose
// connection with exponential backoff and cursor-based resumption.
func (c *Consumer) Run(ctx context.Context) error {
	u, err := url.Parse(c.relayURL)
	if err != nil {
		return fmt.Errorf("invalid relay URL: %w", err)
	}
	switch u.Scheme {
	case "http":
		u.Scheme = "ws"
	case "https":
		u.Scheme = "wss"
	}
	u.Path = "/xrpc/com.atproto.sync.subscribeRepos"

	var retries int
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		// Resume from the last sequence number we saw, if any.
		if seq := c.LastSeq(); seq > 0 {
			u.RawQuery = fmt.Sprintf("cursor=%d", seq)
		}
		urlStr := u.String()
		c.logger.Info("connecting to firehose", "url", urlStr, "retries", retries)

		con, _, err := websocket.DefaultDialer.DialContext(ctx, urlStr, nil)
		if err != nil {
			c.logger.Warn("dialing failed", "error", err, "retries", retries)
			if !sleep(ctx, backoff(retries)) {
				return ctx.Err()
			}
			retries++
			continue
		}
		c.logger.Info("connected to firehose")
		retries = 0

		rsc := &events.RepoStreamCallbacks{
			RepoCommit: func(evt *comatproto.SyncSubscribeRepos_Commit) error {
				return c.handleCommit(ctx, evt)
			},
		}
		// A parallel scheduler fans work out across repos while preserving
		// per-repo ordering. For a demo, a sequential scheduler is also fine.
		sched := parallel.NewScheduler(8, 100, c.relayURL, rsc.EventHandler)
		if err := events.HandleRepoStream(ctx, con, sched, c.logger); err != nil {
			c.logger.Warn("firehose connection failed", "error", err)
		}
	}
}

// handleCommit verifies the commit, walks the CAR slice, and decodes any
// app.bsky.feed.post records into Posts that are broadcast to subscribers.
func (c *Consumer) handleCommit(ctx context.Context, evt *comatproto.SyncSubscribeRepos_Commit) error {
	// VerifyCommitMessage parses the CAR slice in evt.Blocks into a partial
	// MST and validates the commit signature + structure. For a demo we
	// trust the relay; production code should verify the signature against
	// independently-resolved identity (see the sync spec's validation
	// checklist).
	r, err := repo.VerifyCommitMessage(ctx, evt)
	if err != nil {
		c.logger.Debug("failed to verify commit", "did", evt.Repo, "error", err)
		return nil // skip malformed commits rather than killing the stream
	}

	for _, op := range evt.Ops {
		collection, rkey, err := syntax.ParseRepoPath(op.Path)
		if err != nil {
			continue
		}
		// Only materialize records we care about. Filtering by collection
		// here is the single biggest bandwidth/CPU win for a demo.
		switch collection.String() {
		case "app.bsky.feed.post":
			c.decodePost(ctx, r, evt, op, collection, rkey)
		case plugins.NSID: // "dev.atproto-demo.plugin"
			c.decodePlugin(ctx, r, evt, op, collection, rkey)
		}
	}
	return nil
}

// decodePost builds a Post from the commit op and broadcasts it.
func (c *Consumer) decodePost(ctx context.Context, r *repo.Repo, evt *comatproto.SyncSubscribeRepos_Commit, op *comatproto.SyncSubscribeRepos_RepoOp, collection syntax.NSID, rkey syntax.RecordKey) {
	p := Post{
		Did:       evt.Repo,
		Rkey:      rkey.String(),
		URI:       fmt.Sprintf("at://%s/%s", evt.Repo, op.Path),
		Action:    op.Action,
		Seq:       evt.Seq,
		Time:      evt.Time,
		CreatedAt: evt.Time,
	}
	if op.Cid != nil {
		p.CID = op.Cid.String()
	}

	// For creates/updates, decode the record bytes from the CAR slice.
	// atdata.UnmarshalCBOR returns a generic map[string]any; we pull the
	// fields we care about by hand. To decode into the fully-typed
	// appbsky.FeedPost struct instead, re-marshal the map to JSON
	// (atdata's Bytes/CIDLink types implement MarshalJSON) and run
	// json.Unmarshal into *appbsky.FeedPost.
	if op.Action == "create" || op.Action == "update" {
		recBytes, _, err := r.GetRecordBytes(ctx, collection, rkey)
		if err != nil {
			c.logger.Debug("failed to get record bytes", "path", op.Path, "error", err)
			return
		}
		rec, err := atdata.UnmarshalCBOR(recBytes)
		if err != nil {
			c.logger.Debug("failed to unmarshal record", "path", op.Path, "error", err)
			return
		}
		p.Text = stringField(rec, "text")
		if v := stringField(rec, "createdAt"); v != "" {
			p.CreatedAt = v
		}
		p.Langs = stringSliceField(rec, "langs")
		p.Tags = stringSliceField(rec, "tags")
	}

	c.broadcast(p)
}

// decodePlugin builds a PluginSummary from the commit op and broadcasts it.
// Uses plugins.DecodeSummary to read metadata fields from the raw CBOR map;
// the source is intentionally not read (fetch on demand). This is the
// raw-JSON decode lesson from ticket REPO-BROWSER: do not use indigo's typed
// LexiconTypeDecoder, which rejects unregistered $type values.
func (c *Consumer) decodePlugin(ctx context.Context, r *repo.Repo, evt *comatproto.SyncSubscribeRepos_Commit, op *comatproto.SyncSubscribeRepos_RepoOp, collection syntax.NSID, rkey syntax.RecordKey) {
	summary := plugins.PluginSummary{
		URI:       fmt.Sprintf("at://%s/%s", evt.Repo, op.Path),
		AuthorDID: evt.Repo,
		Rkey:      rkey.String(),
		Action:    op.Action,
		Seq:       evt.Seq,
		Time:      evt.Time,
	}
	if op.Cid != nil {
		summary.CID = op.Cid.String()
	}
	// For creates/updates, decode metadata from the CAR slice. Deletes carry
	// no record bytes; we broadcast a minimal summary so the feed can remove
	// the plugin from its catalog.
	if op.Action == "create" || op.Action == "update" {
		recBytes, _, err := r.GetRecordBytes(ctx, collection, rkey)
		if err != nil {
			c.logger.Debug("failed to get plugin record bytes", "path", op.Path, "error", err)
			return
		}
		rec, err := atdata.UnmarshalCBOR(recBytes)
		if err != nil {
			c.logger.Debug("failed to unmarshal plugin record", "path", op.Path, "error", err)
			return
		}
		summary = plugins.DecodeSummary(evt.Repo, summary.URI, summary.CID, rkey.String(), op.Action, evt.Seq, evt.Time, rec)
	}
	c.broadcastPlugin(summary)
}

func backoff(retries int) time.Duration {
	d := time.Second << uint(retries)
	if d > 30*time.Second {
		d = 30 * time.Second
	}
	return d
}

func sleep(ctx context.Context, d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-t.C:
		return true
	}
}

// stringField reads a string field from a decoded record map.
func stringField(rec map[string]any, key string) string {
	if v, ok := rec[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

// stringSliceField reads a []string field from a decoded record map.
func stringSliceField(rec map[string]any, key string) []string {
	v, ok := rec[key]
	if !ok {
		return nil
	}
	arr, ok := v.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(arr))
	for _, e := range arr {
		if s, ok := e.(string); ok {
			out = append(out, s)
		}
	}
	return out
}
