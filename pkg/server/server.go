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

	lexutil "github.com/bluesky-social/indigo/lex/util"
)

// Server holds the HTTP server and its dependencies.
type Server struct {
	consumer *firehose.Consumer
	oauth    *oauth.Factory
	logger   *slog.Logger

	mu      sync.Mutex
	ring    []firehose.Post // bounded ring buffer of recent posts
	ringCap int

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
		consumer: consumer,
		oauth:    oauthFactory,
		logger:   logger,
		ringCap:  200,
	}
	// Subscribe the server to the firehose so it can (a) keep the ring
	// buffer fresh and (b) fan out to browser WebSockets.
	sub, cancel := consumer.Subscribe()
	_ = cancel // kept alive for the server's lifetime
	go s.pump(sub)
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
	mux.HandleFunc("GET /ws", s.handleWS)

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
