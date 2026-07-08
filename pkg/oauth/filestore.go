package oauth

// File-backed implementation of the indigo [oauth.ClientAuthStore] interface.
//
// The indigo SDK ships [oauth.NewMemStore], an in-memory store that loses
// every session when the process restarts. For a long-running server that
// means the user must re-login after every deploy or crash, and any in-flight
// request whose session was wiped returns "access_denied: expired".
//
// FileStore is a drop-in replacement with the same concurrency model (a single
// mutex serializing all access, exactly like MemStore) plus:
//
//   - persistence to JSON files on disk (sessions.json, requests.json)
//   - atomic writes (write to a temp file, then rename) so a crash mid-write
//     leaves the last good state intact rather than a truncated file
//   - background garbage collection of abandoned auth requests (a login flow
//     that was started but never completed via the callback)
//
// It mirrors MemStore's structure field-for-field: the same map[string]T
// shape, the same composite key "did/sessionID" for sessions, the same
// create-only semantics for SaveAuthRequestInfo. The only addition is that
// every mutation also flushes the whole map to disk. For a single-user demo
// the write amplification is negligible (one ~1KB file rewrite per DPoP
// nonce rotation, which happens at most every few minutes).

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"time"

	indigooauth "github.com/bluesky-social/indigo/atproto/auth/oauth"
	"github.com/bluesky-social/indigo/atproto/syntax"
)

// sessionsFile and requestsFile hold the two persisted maps.
const (
	sessionsFile = "sessions.json"
	requestsFile = "requests.json"
)

// authRequestTTL is how long an in-flight auth request survives without being
// completed by the callback. OAuth flows complete in seconds-to-minutes; an
// hour covers a user who starts login, gets distracted, and comes back.
const authRequestTTL = time.Hour

// gcInterval is how often the background sweeper runs.
const gcInterval = 10 * time.Minute

// FileStore implements [indigooauth.ClientAuthStore] backed by JSON files in a
// directory. It is safe for concurrent use: a mutex serializes all access, the
// same model as [indigooauth.MemStore].
type FileStore struct {
	dir      string
	logger   *slog.Logger
	mu       sync.Mutex
	sessions map[string]indigooauth.ClientSessionData
	requests map[string]timedAuthRequest

	stopGC chan struct{}
	wg     sync.WaitGroup
}

// timedAuthRequest wraps AuthRequestData with a creation timestamp so the GC
// sweeper can evict abandoned flows. The timestamp is set by SaveAuthRequestInfo
// and is not part of the OAuth data itself.
type timedAuthRequest struct {
	Data      indigooauth.AuthRequestData `json:"data"`
	CreatedAt time.Time                   `json:"created_at"`
}

// Compile-time interface check.
var _ indigooauth.ClientAuthStore = (*FileStore)(nil)

// NewFileStore loads (or creates) a persistent store rooted at dir. The
// directory and its parents are created if missing. A background goroutine
// garbage-collects abandoned auth requests every [gcInterval]; call [Close]
// to stop it.
func NewFileStore(dir string, logger *slog.Logger) (*FileStore, error) {
	if logger == nil {
		logger = slog.Default().With("system", "oauth-filestore")
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, fmt.Errorf("create store dir %q: %w", dir, err)
	}
	s := &FileStore{
		dir:      dir,
		logger:   logger,
		sessions: make(map[string]indigooauth.ClientSessionData),
		requests: make(map[string]timedAuthRequest),
		stopGC:   make(chan struct{}),
	}
	if err := s.load(); err != nil {
		return nil, err
	}
	s.wg.Add(1)
	go s.gcLoop()
	return s, nil
}

// Close stops the GC goroutine and waits for it to exit. It is safe to call
// multiple times.
func (s *FileStore) Close() error {
	select {
	case <-s.stopGC:
		// already closed
	default:
		close(s.stopGC)
	}
	s.wg.Wait()
	return nil
}

// load reads both JSON files from disk into memory. Missing files are treated
// as empty stores (first run). A corrupt file is a hard error rather than
// silently wiping sessions.
func (s *FileStore) load() error {
	sessPath := filepath.Join(s.dir, sessionsFile)
	if b, err := os.ReadFile(sessPath); err == nil {
		if err := json.Unmarshal(b, &s.sessions); err != nil {
			return fmt.Errorf("parse %s: %w", sessionsFile, err)
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("read %s: %w", sessionsFile, err)
	}
	reqPath := filepath.Join(s.dir, requestsFile)
	if b, err := os.ReadFile(reqPath); err == nil {
		if err := json.Unmarshal(b, &s.requests); err != nil {
			return fmt.Errorf("parse %s: %w", requestsFile, err)
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("read %s: %w", requestsFile, err)
	}
	// Evict any auth requests that expired while the server was down.
	s.evictExpiredAuthRequestsLocked(time.Now())
	return nil
}

// writeJSONAtomic marshals v and writes it to name via a temp file + rename so
// a crash never leaves a truncated store file. The caller must hold s.mu.
func (s *FileStore) writeJSONAtomic(name string, v any) error {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal %s: %w", name, err)
	}
	finalPath := filepath.Join(s.dir, name)
	tmpPath := finalPath + ".tmp"
	if err := os.WriteFile(tmpPath, b, 0o600); err != nil {
		return fmt.Errorf("write %s: %w", tmpPath, err)
	}
	if err := os.Rename(tmpPath, finalPath); err != nil {
		return fmt.Errorf("rename %s -> %s: %w", tmpPath, finalPath, err)
	}
	return nil
}

// sessionKey is the composite key, matching MemStore's memKey.
func sessionKey(did syntax.DID, sessionID string) string {
	return fmt.Sprintf("%s/%s", did, sessionID)
}

// --- sessions ---

// GetSession returns the persisted session for (did, sessionID).
func (s *FileStore) GetSession(ctx context.Context, did syntax.DID, sessionID string) (*indigooauth.ClientSessionData, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess, ok := s.sessions[sessionKey(did, sessionID)]
	if !ok {
		return nil, fmt.Errorf("session not found: %s", did)
	}
	return &sess, nil
}

// SaveSession upserts a session: updates the in-memory map and flushes the
// whole sessions file atomically. This is the path the SDK's
// PersistSessionCallback hits on every DPoP nonce rotation and token refresh,
// so it must be cheap and safe; for a single-user demo the ~1KB rewrite is
// negligible.
func (s *FileStore) SaveSession(ctx context.Context, sess indigooauth.ClientSessionData) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sessions[sessionKey(sess.AccountDID, sess.SessionID)] = sess
	return s.writeJSONAtomic(sessionsFile, s.sessions)
}

// DeleteSession removes a session from the map and rewrites the file.
func (s *FileStore) DeleteSession(ctx context.Context, did syntax.DID, sessionID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.sessions, sessionKey(did, sessionID))
	return s.writeJSONAtomic(sessionsFile, s.sessions)
}

// --- auth requests ---

// GetAuthRequestInfo returns the in-flight auth request for state. The SDK
// fetches it exactly once, in ProcessCallback.
func (s *FileStore) GetAuthRequestInfo(ctx context.Context, state string) (*indigooauth.AuthRequestData, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	tar, ok := s.requests[state]
	if !ok {
		return nil, fmt.Errorf("auth request not found: %s", state)
	}
	return &tar.Data, nil
}

// SaveAuthRequestInfo stores a new auth request. Create-only: if state already
// exists, it returns an error, matching MemStore's contract.
func (s *FileStore) SaveAuthRequestInfo(ctx context.Context, info indigooauth.AuthRequestData) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.requests[info.State]; ok {
		return fmt.Errorf("auth request already saved for state %s", info.State)
	}
	s.requests[info.State] = timedAuthRequest{Data: info, CreatedAt: time.Now()}
	return s.writeJSONAtomic(requestsFile, s.requests)
}

// DeleteAuthRequestInfo removes an auth request (called by the SDK after the
// callback completes).
func (s *FileStore) DeleteAuthRequestInfo(ctx context.Context, state string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.requests, state)
	return s.writeJSONAtomic(requestsFile, s.requests)
}

// --- garbage collection ---

// gcLoop periodically evicts auth requests older than authRequestTTL. Auth
// requests accumulate when a user starts login but never completes the
// callback (closes the tab, etc.). Sessions are NOT garbage-collected: they
// are revoked explicitly via Logout, and their tokens' real expiry is not
// tracked here (the SDK TODOs the same).
func (s *FileStore) gcLoop() {
	defer s.wg.Done()
	t := time.NewTicker(gcInterval)
	defer t.Stop()
	for {
		select {
		case <-s.stopGC:
			return
		case <-t.C:
			s.mu.Lock()
			dirty := s.evictExpiredAuthRequestsLocked(time.Now())
			err := s.writeJSONAtomic(requestsFile, s.requests)
			s.mu.Unlock()
			if dirty && err != nil {
				s.logger.Error("gc: flush requests", "err", err)
			}
		}
	}
}

// evictExpiredAuthRequestsLocked deletes auth requests older than authRequestTTL.
// Returns true if any were removed (so the caller can skip the file rewrite if
// nothing changed). The caller must hold s.mu.
func (s *FileStore) evictExpiredAuthRequestsLocked(now time.Time) bool {
	cutoff := now.Add(-authRequestTTL)
	dirty := false
	for state, tar := range s.requests {
		if tar.CreatedAt.Before(cutoff) {
			delete(s.requests, state)
			dirty = true
		}
	}
	return dirty
}
