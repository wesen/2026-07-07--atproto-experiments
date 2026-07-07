//go:build ignore
// Reference / sketch for ticket ATPROTO-DEMO; not compiled as part of the demo build.

// Sketch: how to replace the demo's app-password login with ATProto OAuth
// (DPoP-bound access tokens, PKCE, PAR, dynamic client metadata).
//
// This is NOT a complete runnable program. It is an annotated sketch showing
// how the existing demo (pkg/server, pkg/bsky) would be adapted to use the
// indigo OAuth SDK at atproto/auth/oauth, based on the reference
// oauth-web-demo (01-oauth-web-demo.go) and the SDK (02-oauth-sdk-oauth.go).
//
// The key difference from app-password auth:
//   - App password: the server handles the user's password directly and
//     calls com.atproto.server.createSession. The server holds the password
//     material in memory. Not safe for multi-user / public deployment.
//   - OAuth DPoP: the user is redirected to their PDS's authorization server,
//     consents there, and is redirected back with an authorization code. The
//     server never sees a password. Access tokens are bound to a per-session
//     DPoP private key (ES256/P-256), which the SDK generates and signs each
//     request with. The SDK handles DPoP nonce rotation automatically.
//
// What DPoP is, concretely (RFC 9449 + atproto oauth spec):
//   - DPoP = Demonstrating Proof of Possession. The client generates a P-256
//     keypair per session. For every authenticated request it signs a short-lived
//     JWT (the "DPoP token") over the HTTP method, URL, and a server-issued
//     nonce, and sends it in the `DPoP` header. The access token is *bound* to
//     that key, so a stolen access token alone is useless without the key.
//   - atproto mandates DPoP for ALL client types. Server-issued nonces are
//     mandatory and rotate (max 5 min lifetime). The SDK tracks nonces per
//     session per server and retries on HTTP 400 "use_dpop_nonce".
//
// Required new endpoints (served by our Go server, in addition to /api + /ws):
//   GET  /oauth/client-metadata.json   -> public client metadata (fetched by PDS)
//   GET  /oauth/jwks.json             -> public keys (only for confidential clients)
//   GET  /oauth/login                 -> start flow (resolve handle -> PDS -> PAR)
//   GET  /oauth/callback             -> receive auth code, exchange for tokens
//   POST /oauth/refresh              -> refresh the access token
//   POST /oauth/logout                -> revoke + delete session
//
// For localhost dev, the client_id is "http://localhost?<params>" and the PDS
// fetches client metadata from that (special-cased). For public deployment,
// client_id must be a real https:// URL serving client-metadata.json, reachable
// by the PDS (use ngrok for laptop experiments).

package main

import (
	"context"
	"fmt"
	"log/slog"
	"encoding/json"
	"net/http"
	"net/url"
	"os"

	"github.com/bluesky-social/indigo/atproto/auth/oauth"
	"github.com/bluesky-social/indigo/atproto/identity"
	"github.com/bluesky-social/indigo/atproto/syntax"
	"github.com/gorilla/sessions"
)

// scopes requested. "atproto" is the base scope; the fine-grained scope below
// limits the token to creating posts only (the demo's "interesting things with
// my bsky account"). "account:email" is optional.
var oauthScopes = []string{
	"atproto",
	"repo:app.bsky.feed.post?action=create",
	"repo:app.bsky.feed.like?action=create",
}

// OAuthSessionFactory is what would replace pkg/bsky.Login. Instead of a
// single *bsky.Client held in a mutex, the server holds an *oauth.ClientApp
// plus a session store, and resumes a per-account ClientSession per request.
type OAuthSessionFactory struct {
	OAuth       *oauth.ClientApp
	Dir         identity.Directory
	CookieStore *sessions.CookieStore
}

func newOAuthSessionFactory(sessionSecret string) *OAuthSessionFactory {
	// Localhost dev config: client_id is "http://localhost?..."; no public
	// hostname needed. For production, use oauth.NewPublicConfig(clientID,
	// callbackURL, scopes) where clientID is https://<host>/oauth/client-metadata.json.
	config := oauth.NewLocalhostConfig(
		"http://127.0.0.1:8080/oauth/callback",
		oauthScopes,
	)
	// To run as a confidential client (longer token lifetimes, client
	// attestation via a P-256 signing key):
	//   priv, _ := atcrypto.ParsePrivateMultibase(os.Getenv("CLIENT_SECRET_KEY"))
	//   config.SetClientSecret(priv, "primary")
	return &OAuthSessionFactory{
		OAuth:       oauth.NewClientApp(&config, oauth.NewMemStore()),
		Dir:         identity.DefaultDirectory(),
		CookieStore: sessions.NewCookieStore([]byte(sessionSecret)),
	}
}

// handleOAuthLogin replaces the app-password POST /api/login.
// The user submits a handle (NOT a password). We resolve it to a PDS, start
// the auth flow (PAR + PKCE + DPoP key generation happens inside the SDK),
// and redirect the browser to the PDS authorization page.
func (f *OAuthSessionFactory) handleOAuthLogin(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	handle := r.URL.Query().Get("handle")
	if handle == "" {
		http.Error(w, "handle required", http.StatusBadRequest)
		return
	}
	// StartAuthFlow: resolves the handle -> DID -> PDS -> auth server metadata,
	// sends a PAR request (with a DPoP JWT in the header), and returns the
	// authorization URL to redirect the browser to. The SDK stores the PKCE
	// verifier and DPoP private key in its store keyed by state.
	redirectURL, err := f.OAuth.StartAuthFlow(ctx, handle)
	if err != nil {
		http.Error(w, fmt.Sprintf("oauth start: %v", err), http.StatusBadRequest)
		return
	}
	http.Redirect(w, r, redirectURL, http.StatusFound)
}

// handleOAuthCallback receives the redirect back from the PDS. The SDK
// validates the state, exchanges the auth code for tokens (with DPoP), and
// returns session data (account DID, session ID, tokens, DPoP key). We store
// the account DID + session ID in a signed cookie.
func (f *OAuthSessionFactory) handleOAuthCallback(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	sessData, err := f.OAuth.ProcessCallback(ctx, r.URL.Query())
	if err != nil {
		http.Error(w, fmt.Sprintf("oauth callback: %v", err), http.StatusBadRequest)
		return
	}
	sess, _ := f.CookieStore.Get(r, "atproto-demo")
	sess.Values["account_did"] = sessData.AccountDID.String()
	sess.Values["session_id"] = sessData.SessionID
	if err := sess.Save(r, w); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	http.Redirect(w, r, "/", http.StatusFound)
}

// resumeSession loads the per-account OAuth session and returns an
// *atclient.APIClient that is already DPoP-bound. This replaces the
// pkg/bsky.Client. All /api/post and /api/like handlers go through here.
func (f *OAuthSessionFactory) resumeSession(r *http.Request) (*oauth.ClientSession, error) {
	sess, _ := f.CookieStore.Get(r, "atproto-demo")
	didStr, _ := sess.Values["account_did"].(string)
	sessionID, _ := sess.Values["session_id"].(string)
	if didStr == "" || sessionID == "" {
		return nil, fmt.Errorf("not authenticated")
	}
	did, err := syntax.ParseDID(didStr)
	if err != nil {
		return nil, err
	}
	return f.OAuth.ResumeSession(r.Context(), did, sessionID)
}

// handleCreatePost shows the per-request pattern: resume the DPoP-bound
// session, get the APIClient, and call createRecord. The DPoP JWT is signed
// and attached automatically by the session's auth method.
func (f *OAuthSessionFactory) handleCreatePost(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	oauthSess, err := f.resumeSession(r)
	if err != nil {
		http.Error(w, "not authenticated", http.StatusUnauthorized)
		return
	}
	c := oauthSess.APIClient()
	text := r.PostFormValue("text")
	body := map[string]any{
		"repo":       c.AccountDID.String(),
		"collection": "app.bsky.feed.post",
		"record": map[string]any{
			"$type":     "app.bsky.feed.post",
			"text":      text,
			"createdAt": syntax.DatetimeNow(),
		},
	}
	if err := c.Post(ctx, "com.atproto.repo.createRecord", body, nil); err != nil {
		http.Error(w, fmt.Sprintf("post failed: %v", err), http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusOK)
}

// handleClientMetadata serves the public client metadata document the PDS
// fetches to register the client. For localhost dev the PDS special-cases
// "http://localhost" and does not actually fetch this, but serving it is
// still required for consistency.
func (f *OAuthSessionFactory) handleClientMetadata(w http.ResponseWriter, r *http.Request) {
	meta := f.OAuth.Config.ClientMetadata()
	meta.ClientName = strPtr("ATProto Firehose Demo")
	meta.ClientURI = strPtr(fmt.Sprintf("https://%s", r.Host))
	if err := meta.Validate(f.OAuth.Config.ClientID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(meta)
}

func strPtr(s string) *string { return &s }

// Wiring into the existing server (pkg/server/server.go): replace the
// bsky.Client field with an *OAuthSessionFactory, and add these routes:
//
//	mux.HandleFunc("GET  /oauth/client-metadata.json", factory.handleClientMetadata)
//	mux.HandleFunc("GET  /oauth/login", factory.handleOAuthLogin)
//	mux.HandleFunc("GET  /oauth/callback", factory.handleOAuthCallback)
//	mux.HandleFunc("POST /oauth/logout", factory.handleOAuthLogout)
//	mux.HandleFunc("POST /api/post", factory.handleCreatePost)
//
// The frontend AccountPanel.tsx changes: the login form asks for a HANDLE
// only (no password), and submits to /oauth/login, which redirects away to
// bsky.app. After consent, the user comes back to /oauth/callback and lands
// on the app already logged in.

func _main() {
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, nil)))
	factory := newOAuthSessionFactory(os.Getenv("SESSION_SECRET"))
	mux := http.NewServeMux()
	mux.HandleFunc("GET /oauth/client-metadata.json", factory.handleClientMetadata)
	mux.HandleFunc("GET /oauth/login", factory.handleOAuthLogin)
	mux.HandleFunc("GET /oauth/callback", factory.handleOAuthCallback)
	mux.HandleFunc("POST /api/post", factory.handleCreatePost)
	_ = http.ListenAndServe(":8080", mux)
}

// Unused import shims for the sketch:
var (
	_ = url.Parse
	_ context.Context
)
