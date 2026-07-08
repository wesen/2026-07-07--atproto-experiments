// Package server wires the firehose consumer and the bsky account client
// behind a single HTTP server using only the standard library
// net/http.ServeMux (Go 1.22+ pattern matching).
//
// Routes:
//
//	GET  /                  -> embedded React/Vite SPA (production)
//	GET  /api/posts         -> recent posts as JSON (ring buffer snapshot)
//	GET  /api/status        -> consumer status (last seq, relay, subs)
//	POST /api/login         -> {identifier, password} -> session info
//	POST /api/post          -> {text} -> create a post (requires login)
//	POST /api/like          -> {uri, cid} -> like a post (requires login)
//	GET  /ws                -> WebSocket: live post stream to the browser
//
// The server owns a single firehose.Consumer and fans its Post stream out
// to every connected /ws client. It keeps a small in-memory ring buffer so
// newly-connected clients immediately see recent activity.
package server

import (
	"context"
	"encoding/json"
	"io/fs"
	"log/slog"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/wesen/atproto-experiments/pkg/bsky"
	"github.com/wesen/atproto-experiments/pkg/firehose"
	"github.com/wesen/atproto-experiments/pkg/oauth"
	"github.com/wesen/atproto-experiments/pkg/plugins"
	"github.com/wesen/atproto-experiments/pkg/repobrowser"

	lexutil "github.com/bluesky-social/indigo/lex/util"
)

// Server holds the HTTP server and its dependencies.
type Server struct {
	consumer *firehose.Consumer
	oauth    *oauth.Factory
	repos    *repobrowser.Browser
	logger   *slog.Logger

	mu      sync.Mutex
	ring    []firehose.Post // bounded ring buffer of recent posts
	ringCap int

	// pluginRing holds recently-seen dev.atproto-demo.plugin records from the
	// firehose, for the /api/plugins/feed endpoint (ticket PLUGIN-SHARING).
	pluginRing []plugins.PluginSummary
	pluginCap  int

	wsSubs  sync.Map // map[int]chan firehose.Post
	nextSub atomic.Int64
}

// NewServer creates a Server backed by the given firehose consumer and OAuth
// factory.
func NewServer(consumer *firehose.Consumer, oauthFactory *oauth.Factory, logger *slog.Logger) *Server {
	if logger == nil {
		logger = slog.Default().With("system", "server")
	}
	s := &Server{
		consumer:  consumer,
		oauth:     oauthFactory,
		repos:     repobrowser.NewBrowser(logger),
		logger:    logger,
		ringCap:    200,
		pluginCap: 200,
	}
	// Subscribe the server to the firehose so it can (a) keep the ring
	// buffer fresh and (b) fan out to browser WebSockets.
	sub, cancel := consumer.Subscribe()
	_ = cancel // kept alive for the server's lifetime
	go s.pump(sub)
	// Subscribe to plugin records for the plugin feed ring buffer.
	pluginSub, pluginCancel := consumer.SubscribePlugins()
	_ = pluginCancel
	go s.pumpPlugins(pluginSub)
	return s
}

// pump ingests firehose posts into the ring buffer and fans them out.
func (s *Server) pump(sub <-chan firehose.Post) {
	for p := range sub {
		s.mu.Lock()
		s.ring = append(s.ring, p)
		if len(s.ring) > s.ringCap {
			s.ring = s.ring[len(s.ring)-s.ringCap:]
		}
		s.mu.Unlock()

		s.wsSubs.Range(func(_, v any) bool {
			ch := v.(chan firehose.Post)
			select {
			case ch <- p:
			default:
			}
			return true
		})
	}
}

// pumpPlugins ingests plugin summaries from the firehose into the plugin
// ring buffer. Unlike posts, plugins are not fanned out over WebSocket in
// v1; the browser polls /api/plugins/feed.
func (s *Server) pumpPlugins(sub <-chan plugins.PluginSummary) {
	for p := range sub {
		s.mu.Lock()
		if p.Action == "delete" {
			// drop deleted plugins from the ring
			filtered := s.pluginRing[:0]
			for _, e := range s.pluginRing {
				if e.URI != p.URI {
					filtered = append(filtered, e)
				}
			}
			s.pluginRing = filtered
		} else {
			s.pluginRing = append(s.pluginRing, p)
			if len(s.pluginRing) > s.pluginCap {
				s.pluginRing = s.pluginRing[len(s.pluginRing)-s.pluginCap:]
			}
		}
		s.mu.Unlock()
	}
}

// Handler returns the root http.Handler. If spaFS is non-nil it is served
// at "/" for the embedded production frontend.
func (s *Server) Handler(spaFS fs.FS) http.Handler {
	mux := http.NewServeMux()

	if spaFS != nil {
		// Serve static assets. The SPA fallback (client-side routing) is
		// handled by serving index.html for unknown non-API paths.
		mux.Handle("GET /", s.spaHandler(spaFS))
	}

	mux.HandleFunc("GET /api/posts", s.handlePosts)
	mux.HandleFunc("GET /api/status", s.handleStatus)
	mux.HandleFunc("GET /oauth/client-metadata.json", s.oauth.HandleClientMetadata)
	mux.HandleFunc("GET /oauth/login", s.oauth.HandleLogin)
	mux.HandleFunc("GET /oauth/callback", s.oauth.HandleCallback)
	mux.HandleFunc("POST /oauth/logout", s.oauth.HandleLogout)
	mux.HandleFunc("POST /api/post", s.handlePost)
	mux.HandleFunc("POST /api/like", s.handleLike)
	mux.HandleFunc("GET /api/repo/describe", s.handleRepoDescribe)
	mux.HandleFunc("GET /api/repo/records", s.handleRepoRecords)
	mux.HandleFunc("GET /api/repo/record", s.handleRepoRecord)
	mux.HandleFunc("GET /ws", s.handleWS)

	// Plugin sharing endpoints (ticket PLUGIN-SHARING).
	mux.HandleFunc("POST /api/plugins/publish", s.handlePublishPlugin)
	mux.HandleFunc("GET /api/plugins/feed", s.handlePluginFeed)
	mux.HandleFunc("GET /api/plugins/list", s.handleListPlugins)
	mux.HandleFunc("GET /api/plugins/record", s.handleGetPlugin)

	return mux
}

// spaHandler serves embedded files, falling back to index.html.
func (s *Server) spaHandler(spaFS fs.FS) http.Handler {
	fileServer := http.FileServer(http.FS(spaFS))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Try the requested path; on missing, fall back to index.html.
		if _, err := fs.Stat(spaFS, r.URL.Path[1:]); err != nil {
			r2 := r.Clone(r.Context())
			r2.URL.Path = "/"
			fileServer.ServeHTTP(w, r2)
			return
		}
		fileServer.ServeHTTP(w, r)
	})
}

func (s *Server) handlePosts(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	posts := make([]firehose.Post, len(s.ring))
	copy(posts, s.ring)
	s.mu.Unlock()
	writeJSON(w, http.StatusOK, posts)
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"lastSeq":   s.consumer.LastSeq(),
		"loggedIn": s.oauth.IsAuthenticated(r),
		"did":      s.oauth.AccountDID(r),
	})
}

type postRequest struct {
	Text string `json:"text"`
}

func (s *Server) handlePost(w http.ResponseWriter, r *http.Request) {
	api, did, ok := s.authedClient(w, r)
	if !ok {
		return
	}
	var req postRequest
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	uri, cid, err := bsky.CreatePostWithClient(r.Context(), api, did, req.Text)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"uri": uri, "cid": cid})
}

type likeRequest struct {
	URI string `json:"uri"`
	CID string `json:"cid"`
}

func (s *Server) handleLike(w http.ResponseWriter, r *http.Request) {
	api, did, ok := s.authedClient(w, r)
	if !ok {
		return
	}
	var req likeRequest
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	uri, err := bsky.LikeWithClient(r.Context(), api, did, req.URI, req.CID)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"uri": uri})
}

// authedClient resumes the OAuth session and returns the DPoP-bound API client
// and the account DID. Writes a 401 and returns ok=false if not authenticated.
func (s *Server) authedClient(w http.ResponseWriter, r *http.Request) (lexutil.LexClient, string, bool) {
	api, err := s.oauth.ResumeClient(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
		return nil, "", false
	}
	return api, api.AccountDID.String(), true
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func decodeJSON(r *http.Request, v any) error {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(v)
}

// Run starts the HTTP server on addr until ctx is canceled.
func (s *Server) Run(ctx context.Context, addr string, spaFS fs.FS) error {
	srv := &http.Server{
		Addr:              addr,
		Handler:           s.Handler(spaFS),
		ReadHeaderTimeout: 5 * time.Second,
	}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdownCtx)
	}()
	s.logger.Info("HTTP server listening", "addr", addr)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return err
	}
	return nil
}

// --- repository browser handlers ---

// handleRepoDescribe returns the repo description (collections, did, handle)
// for ?repo=<handle or DID>. Uses an unauthenticated PDS client for public
// reads, or the OAuth session if the repo is the logged-in user.
func (s *Server) handleRepoDescribe(w http.ResponseWriter, r *http.Request) {
	repo := r.URL.Query().Get("repo")
	if repo == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "repo query param required"})
		return
	}
	authed := s.repoAuthedClient(r, repo)
	desc, err := s.repos.Describe(r.Context(), repo, authed)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, desc)
}

// handleRepoRecords lists records in a collection: ?repo=&collection=&cursor=&limit=
func (s *Server) handleRepoRecords(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	repo := q.Get("repo")
	collection := q.Get("collection")
	if repo == "" || collection == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "repo and collection required"})
		return
	}
	limit := int64(50)
	authed := s.repoAuthedClient(r, repo)
	records, next, err := s.repos.ListRecords(r.Context(), repo, collection, q.Get("cursor"), limit, authed)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"records": records, "cursor": next})
}

// handleRepoRecord fetches a single record: ?repo=&collection=&rkey=
func (s *Server) handleRepoRecord(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	repo := q.Get("repo")
	collection := q.Get("collection")
	rkey := q.Get("rkey")
	if repo == "" || collection == "" || rkey == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "repo, collection, rkey required"})
		return
	}
	authed := s.repoAuthedClient(r, repo)
	detail, err := s.repos.GetRecord(r.Context(), repo, collection, rkey, authed)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

// repoAuthedClient returns the OAuth session's client if the requested repo
// matches the logged-in account's DID, so the user browses their own repo with
// their token. Returns nil for other repos (public unauthenticated reads).
func (s *Server) repoAuthedClient(r *http.Request, repo string) lexutil.LexClient {
	api, err := s.oauth.ResumeClient(r)
	if err != nil {
		return nil
	}
	if api.AccountDID != nil && api.AccountDID.String() == repo {
		return api
	}
	return nil
}

// --- plugin sharing handlers (ticket PLUGIN-SHARING) ---

type publishPluginRequest struct {
	Title        string             `json:"title"`
	Description  string             `json:"description"`
	Source       string             `json:"source"`
	Version      string             `json:"version"`
	PackageIDs   []string           `json:"packageIds"`
	Capabilities *plugins.Capabilities `json:"capabilities"`
	Hooks        *plugins.Hooks     `json:"hooks"`
	HomeSurface  string             `json:"homeSurface"`
	License      string             `json:"license"`
}

// handlePublishPlugin writes a dev.atproto-demo.plugin record to the logged-in
// user's repo via com.atproto.repo.createRecord, using the raw LexDo path
// (no generated Go type for the custom Lexicon).
func (s *Server) handlePublishPlugin(w http.ResponseWriter, r *http.Request) {
	api, did, ok := s.authedClient(w, r)
	if !ok {
		return
	}
	var req publishPluginRequest
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if req.Title == "" || req.Source == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "title and source are required"})
		return
	}
	if len(req.PackageIDs) == 0 {
		req.PackageIDs = []string{"ui"}
	}
	if req.Capabilities == nil {
		req.Capabilities = &plugins.Capabilities{Domain: []string{"feed"}, System: []string{}}
	}
	if req.HomeSurface == "" {
		req.HomeSurface = "panel"
	}
	rec := plugins.NewPublishRecord(req.Title, req.Source, req.PackageIDs, req.Capabilities)
	rec.Description = req.Description
	rec.Version = req.Version
	rec.Hooks = req.Hooks
	rec.HomeSurface = req.HomeSurface
	rec.License = req.License
	out, err := plugins.Publish(r.Context(), api, did, rec)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// handlePluginFeed returns recently-seen plugin summaries from the firehose
// ring buffer, newest first. Public (unauthenticated).
func (s *Server) handlePluginFeed(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	pluginsOut := make([]plugins.PluginSummary, len(s.pluginRing))
	copy(pluginsOut, s.pluginRing)
	s.mu.Unlock()
	// newest first
	for i, j := 0, len(pluginsOut)-1; i < j; i, j = i+1, j-1 {
		pluginsOut[i], pluginsOut[j] = pluginsOut[j], pluginsOut[i]
	}
	writeJSON(w, http.StatusOK, map[string]any{"plugins": pluginsOut})
}

// handleListPlugins lists dev.atproto-demo.plugin records in a repo:
// ?repo=<did or handle>&cursor=. Reuses the repo browser's raw-JSON
// ListRecords so any collection decodes. Public (unauthenticated).
func (s *Server) handleListPlugins(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	repoID := q.Get("repo")
	if repoID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "repo query param required"})
		return
	}
	authed := s.repoAuthedClient(r, repoID)
	records, next, err := s.repos.ListRecords(r.Context(), repoID, plugins.NSID, q.Get("cursor"), 50, authed)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"records": records, "cursor": next})
}

// handleGetPlugin fetches a single plugin record's full value (including
// source): ?repo=<did or handle>&rkey=<rkey>. Reuses the repo browser's
// raw-JSON GetRecord. Public (unauthenticated).
func (s *Server) handleGetPlugin(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	repoID := q.Get("repo")
	rkey := q.Get("rkey")
	if repoID == "" || rkey == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "repo and rkey required"})
		return
	}
	authed := s.repoAuthedClient(r, repoID)
	detail, err := s.repos.GetRecord(r.Context(), repoID, plugins.NSID, rkey, authed)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, detail)
}
