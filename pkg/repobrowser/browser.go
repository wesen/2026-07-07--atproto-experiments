// Package repobrowser walks an ATProto repository: describe the repo, list
// collections, paginate records within a collection, and fetch a single
// record. It is the backend for the repository browser page.
//
// Repository reads are public and unauthenticated. This package uses a plain
// atclient.APIClient pointed at the account's PDS (resolved from the DID
// document), so it can browse ANY public repo by handle or DID. When the
// caller has an authenticated OAuth session, that session's client can be
// passed instead to read the authenticated user's own repo (including any
// non-public read scope the token grants).
package repobrowser

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	comatproto "github.com/bluesky-social/indigo/api/atproto"
	"github.com/bluesky-social/indigo/atproto/atclient"
	"github.com/bluesky-social/indigo/atproto/identity"
	"github.com/bluesky-social/indigo/atproto/syntax"
	"github.com/bluesky-social/indigo/lex/util"
)

// Browser resolves a handle/DID to its PDS and issues repository XRPC queries.
type Browser struct {
	dir    identity.Directory
	client *http.Client
	logger *slog.Logger
}

// NewBrowser creates a Browser using the default identity directory (DID PLC,
// did:web, DNS handle resolution).
func NewBrowser(logger *slog.Logger) *Browser {
	if logger == nil {
		logger = slog.Default().With("system", "repobrowser")
	}
	return &Browser{
		dir:    identity.DefaultDirectory(),
		client: &http.Client{},
		logger: logger,
	}
}

// pdsClient resolves an identifier (handle or DID) to its PDS host and returns
// an atclient.APIClient pointed at that host. Repository reads are public, so
// no auth is attached. If an authenticated lexutil.LexClient is provided
// (non-nil), it is used directly instead (e.g. for the user's own repo).
func (b *Browser) pdsClient(ctx context.Context, identifier string, authed util.LexClient) (util.LexClient, string, error) {
	if authed != nil {
		return authed, "", nil
	}
	atid, err := syntax.ParseAtIdentifier(identifier)
	if err != nil {
		return nil, "", fmt.Errorf("invalid identifier: %w", err)
	}
	ident, err := b.dir.Lookup(ctx, atid)
	if err != nil {
		return nil, "", fmt.Errorf("resolve %s: %w", identifier, err)
	}
	host := ident.PDSEndpoint()
	if host == "" {
		return nil, "", fmt.Errorf("identity has no PDS endpoint")
	}
	return atclient.NewAPIClient(host), ident.DID.String(), nil
}

// RepoDescription is the describe-repo response, trimmed for the UI.
type RepoDescription struct {
	Did              string   `json:"did"`
	Handle           string   `json:"handle"`
	HandleIsCorrect  bool     `json:"handleIsCorrect"`
	Collections      []string `json:"collections"`
	Rev              string   `json:"rev,omitempty"`
}

// Describe calls com.atproto.repo.describeRepo.
func (b *Browser) Describe(ctx context.Context, identifier string, authed util.LexClient) (*RepoDescription, error) {
	c, _, err := b.pdsClient(ctx, identifier, authed)
	if err != nil {
		return nil, err
	}
	out, err := comatproto.RepoDescribeRepo(ctx, c, identifier)
	if err != nil {
		return nil, fmt.Errorf("describeRepo: %w", err)
	}
	return &RepoDescription{
		Did:             out.Did,
		Handle:          out.Handle,
		HandleIsCorrect: out.HandleIsCorrect,
		Collections:     out.Collections,
	}, nil
}

// RecordSummary is a list-records entry without the full value (the UI lists
// records by URI/CID first, then fetches the full value on demand).
type RecordSummary struct {
	URI string `json:"uri"`
	CID string `json:"cid"`
	Rkey string `json:"rkey"`
}

// listRecordsRaw is the generic JSON shape of the listRecords response,
// using json.RawMessage for the value so ANY collection decodes (including
// custom Lexicons like dev.hypercard.* that indigo has not registered).
type listRecordsRaw struct {
	Cursor  *string `json:"cursor,omitempty"`
	Records []struct {
		Cid   string          `json:"cid"`
		Uri   string          `json:"uri"`
		Value json.RawMessage `json:"value"`
	} `json:"records"`
}

// ListRecords calls com.atproto.repo.listRecords for a collection, paginated.
// It returns summaries (uri/cid/rkey) plus the next cursor. Uses a raw JSON
// decode so it works for any collection, even custom Lexicons indigo does not
// register a Go type for.
func (b *Browser) ListRecords(ctx context.Context, identifier, collection, cursor string, limit int64, authed util.LexClient) ([]RecordSummary, string, error) {
	c, _, err := b.pdsClient(ctx, identifier, authed)
	if err != nil {
		return nil, "", err
	}
	params := map[string]any{
		"collection": collection,
		"repo":       identifier,
		"limit":      limit,
		"reverse":    false,
	}
	if cursor != "" {
		params["cursor"] = cursor
	}
	var raw listRecordsRaw
	if err := c.LexDo(ctx, util.Query, "", "com.atproto.repo.listRecords", params, nil, &raw); err != nil {
		return nil, "", fmt.Errorf("listRecords: %w", err)
	}
	summaries := make([]RecordSummary, 0, len(raw.Records))
	for _, r := range raw.Records {
		summaries = append(summaries, RecordSummary{
			URI:  r.Uri,
			CID:  r.Cid,
			Rkey: rkeyFromURI(r.Uri),
		})
	}
	next := ""
	if raw.Cursor != nil {
		next = *raw.Cursor
	}
	return summaries, next, nil
}

// RecordDetail is a single record with its decoded value as raw JSON.
type RecordDetail struct {
	URI   string          `json:"uri"`
	CID   string          `json:"cid"`
	Value json.RawMessage `json:"value"`
}

// getRecordRaw is the generic JSON shape of the getRecord response.
type getRecordRaw struct {
	Cid   *string         `json:"cid,omitempty"`
	Uri   string          `json:"uri"`
	Value json.RawMessage `json:"value"`
}

// GetRecord calls com.atproto.repo.getRecord for a single record. The value
// is decoded as raw JSON so it works for any collection, including custom
// Lexicons indigo does not register a Go type for.
func (b *Browser) GetRecord(ctx context.Context, identifier, collection, rkey string, authed util.LexClient) (*RecordDetail, error) {
	c, _, err := b.pdsClient(ctx, identifier, authed)
	if err != nil {
		return nil, err
	}
	params := map[string]any{
		"collection": collection,
		"repo":       identifier,
		"rkey":       rkey,
	}
	var raw getRecordRaw
	if err := c.LexDo(ctx, util.Query, "", "com.atproto.repo.getRecord", params, nil, &raw); err != nil {
		return nil, fmt.Errorf("getRecord: %w", err)
	}
	cid := ""
	if raw.Cid != nil {
		cid = *raw.Cid
	}
	return &RecordDetail{URI: raw.Uri, CID: cid, Value: raw.Value}, nil
}

// rkeyFromURI extracts the record key from an at:// URI:
// at://<did>/<collection>/<rkey> -> <rkey>
// Go's net/url cannot parse at:// URIs (colons in the DID authority confuse
// host:port splitting), so split the path manually.
func rkeyFromURI(uri string) string {
	// strip scheme
	rest := uri
	if i := strings.Index(rest, "://"); i >= 0 {
		rest = rest[i+3:]
	}
	// rest is <did>/<collection>/<rkey>
	parts := strings.SplitN(rest, "/", 3)
	if len(parts) < 3 {
		return ""
	}
	return parts[2]
}
