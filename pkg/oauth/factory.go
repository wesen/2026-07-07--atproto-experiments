// Package oauth wraps the indigo atproto OAuth client SDK to provide
// DPoP-bound login that replaces the demo's app-password authentication.
//
// The user signs in with a HANDLE only (no password). The factory starts the
// OAuth authorization flow (PAR + PKCE + per-session DPoP key generation,
// all handled by the SDK), redirects the browser to the user's PDS
// authorization page, and receives a DPoP-bound access token via the callback.
// The server never sees or holds a password.
//
// For every authenticated API request, ResumeClient loads the per-account
// OAuth session and returns a DPoP-bound *atclient.APIClient. The SDK signs a
// fresh DPoP JWT (RFC 9449) for each request and rotates the server-issued
// DPoP nonce automatically.
package oauth

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/bluesky-social/indigo/atproto/atclient"
	"github.com/bluesky-social/indigo/atproto/auth/oauth"
	"github.com/bluesky-social/indigo/atproto/syntax"
	"github.com/gorilla/sessions"
)

// scopes requested from the PDS. "atproto" is the base scope; the fine-grained
// repo scopes limit the token to creating posts and likes only.
var defaultScopes = []string{
	"atproto",
	"repo:app.bsky.feed.post?action=create",
	"repo:app.bsky.feed.like?action=create",
}

// Factory owns the OAuth client app, an in-memory session store, and the
// signed cookie store used to identify browser sessions across requests.
type Factory struct {
	Oauth       *oauth.ClientApp
	cookieStore *sessions.CookieStore
	logger      *slog.Logger
}

// NewFactory creates an OAuth factory for localhost development. The
// callbackURL must be reachable by the PDS redirect (use 127.0.0.1:PORT for
// local dev; the atproto localhost client_id special-case means no public
// hostname is required). sessionSecret signs the browser cookie.
func NewFactory(callbackURL, sessionSecret string, logger *slog.Logger) *Factory {
	if logger == nil {
		logger = slog.Default().With("system", "oauth")
	}
	config := oauth.NewLocalhostConfig(callbackURL, defaultScopes)
	app := oauth.NewClientApp(&config, oauth.NewMemStore())
	return &Factory{
		Oauth:       app,
		cookieStore: sessions.NewCookieStore([]byte(sessionSecret)),
		logger:      logger,
	}
}

// cookieName is the signed cookie holding the account DID + session ID.
const cookieName = "atproto-demo-oauth"

// HandleClientMetadata serves the public client metadata document the PDS
// fetches to register this client. Required even for localhost (the PDS
// special-cases http://localhost and does not fetch it, but serving it keeps
// the client metadata internally consistent).
func (f *Factory) HandleClientMetadata(w http.ResponseWriter, r *http.Request) {
	meta := f.Oauth.Config.ClientMetadata()
	name := "ATProto Firehose Demo"
	meta.ClientName = &name
	uri := "https://" + r.Host
	meta.ClientURI = &uri
	if err := meta.Validate(f.Oauth.Config.ClientID); err != nil {
		f.logger.Error("client metadata invalid", "err", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(meta)
}

// HandleLogin starts the OAuth flow. The handle query parameter is OPTIONAL.
//
// If a handle (or DID, or https:// auth-server URL) is provided, the factory
// resolves it to the account's PDS and starts the flow against that PDS's
// auth server, passing the handle as a login hint (so bsky.app skips the login
// step for a returning user).
//
// If no handle is provided, the flow starts against the public bsky.social
// entryway auth server directly. The user then selects / authenticates their
// account on bsky.app itself. This is the simplest UX: a single "Sign in with
// Bluesky" button with no form field.
func (f *Factory) HandleLogin(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	identifier := r.URL.Query().Get("handle")
	f.logger.Info("starting oauth flow", "handle", identifier)
	if identifier == "" {
		// No handle: use the public bsky.social entryway as the auth server.
		// The user authenticates on bsky.app and consents there.
		identifier = "https://bsky.social"
	}
	redirectURL, err := f.Oauth.StartAuthFlow(ctx, identifier)
	if err != nil {
		f.logger.Warn("oauth start failed", "handle", identifier, "err", err)
		http.Error(w, fmt.Sprintf("oauth start: %v", err), http.StatusBadRequest)
		return
	}
	http.Redirect(w, r, redirectURL, http.StatusFound)
}

// HandleCallback receives the redirect back from the PDS, exchanges the auth
// code for DPoP-bound tokens, stores the account DID + session ID in a signed
// cookie, and redirects to the SPA root.
func (f *Factory) HandleCallback(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	f.logger.Info("oauth callback", "params", r.URL.Query())
	sessData, err := f.Oauth.ProcessCallback(ctx, r.URL.Query())
	if err != nil {
		f.logger.Warn("oauth callback failed", "err", err)
		http.Error(w, fmt.Sprintf("oauth callback: %v", err), http.StatusBadRequest)
		return
	}
	sess, _ := f.cookieStore.Get(r, cookieName)
	sess.Values["account_did"] = sessData.AccountDID.String()
	sess.Values["session_id"] = sessData.SessionID
	if err := sess.Save(r, w); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	f.logger.Info("oauth login successful", "did", sessData.AccountDID.String())
	http.Redirect(w, r, "/", http.StatusFound)
}

// HandleLogout revokes the session at the PDS and clears the cookie.
func (f *Factory) HandleLogout(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	did, sessionID := f.currentSession(r)
	if did != nil {
		if err := f.Oauth.Logout(ctx, *did, sessionID); err != nil {
			f.logger.Error("logout failed", "did", did, "err", err)
		}
	}
	sess, _ := f.cookieStore.Get(r, cookieName)
	sess.Values = make(map[any]any)
	if err := sess.Save(r, w); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ResumeClient loads the per-account OAuth session and returns a DPoP-bound
// *atclient.APIClient. Returns an error if the user is not logged in.
func (f *Factory) ResumeClient(r *http.Request) (*atclient.APIClient, error) {
	did, sessionID := f.currentSession(r)
	if did == nil {
		return nil, fmt.Errorf("not authenticated")
	}
	sess, err := f.Oauth.ResumeSession(r.Context(), *did, sessionID)
	if err != nil {
		return nil, fmt.Errorf("resume session: %w", err)
	}
	return sess.APIClient(), nil
}

// IsAuthenticated reports whether the request has a resumable OAuth session.
func (f *Factory) IsAuthenticated(r *http.Request) bool {
	did, _ := f.currentSession(r)
	return did != nil
}

// AccountDID returns the authenticated account's DID, or empty if not logged in.
func (f *Factory) AccountDID(r *http.Request) string {
	did, _ := f.currentSession(r)
	if did == nil {
		return ""
	}
	return did.String()
}

// currentSession reads the account DID + session ID from the signed cookie.
func (f *Factory) currentSession(r *http.Request) (*syntax.DID, string) {
	sess, _ := f.cookieStore.Get(r, cookieName)
	didStr, _ := sess.Values["account_did"].(string)
	sessionID, _ := sess.Values["session_id"].(string)
	if didStr == "" || sessionID == "" {
		return nil, ""
	}
	did, err := syntax.ParseDID(didStr)
	if err != nil {
		return nil, ""
	}
	return &did, sessionID
}

// ensure context import is used (ResumeClient uses r.Context() implicitly via *http.Request)
var _ = context.Background
