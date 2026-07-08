// Package bsky wraps the indigo atproto client to perform authenticated
// account actions (the "do interesting things with my bsky account" half
// of the demo): log in with an app password, fetch the user's profile,
// create a post, and like a post.
//
// Auth uses com.atproto.server.createSession (app password). For a
// production app with end-user login, implement OAuth instead (see the
// OAuth spec and the atproto/auth/oauth package). App passwords are fine
// for bots, CLIs, and personal demos.
package bsky

import (
	"context"
	"fmt"
	"time"

	comatproto "github.com/bluesky-social/indigo/api/atproto"
	appbsky "github.com/bluesky-social/indigo/api/bsky"
	"github.com/bluesky-social/indigo/atproto/atclient"
	"github.com/bluesky-social/indigo/atproto/identity"
	"github.com/bluesky-social/indigo/atproto/syntax"
	lexutil "github.com/bluesky-social/indigo/lex/util"
)

// Client is an authenticated Bluesky account client.
type Client struct {
	api     *atclient.APIClient
	did     string
	handle string
}

// Login authenticates with an app password and returns a Client.
// host is the PDS host (e.g. "https://bsky.social"); identifier is a handle
// or DID; password is the account password or app password.
func Login(ctx context.Context, host, identifier, password string) (*Client, error) {
	atid, err := syntax.ParseAtIdentifier(identifier)
	if err != nil {
		return nil, fmt.Errorf("invalid identifier: %w", err)
	}
	// LoginWithPasswordHost resolves the PDS from a fixed host. Use
	// LoginWithPassword (with an identity.Directory) when the identifier
	// should be resolved to its PDS via DID/handle resolution.
	api, err := atclient.LoginWithPasswordHost(ctx, host, atid.String(), password, "", nil)
	if err != nil {
		return nil, fmt.Errorf("login failed: %w", err)
	}

	// Confirm the session and capture the account's DID + handle.
	var sess struct {
		Did    string `json:"did"`
		Handle string `json:"handle"`
	}
	if err := api.Get(ctx, "com.atproto.server.getSession", nil, &sess); err != nil {
		return nil, fmt.Errorf("getSession failed: %w", err)
	}
	return &Client{api: api, did: sess.Did, handle: sess.Handle}, nil
}

// DID returns the authenticated account's DID.
func (c *Client) DID() string { return c.did }

// Handle returns the authenticated account's handle.
func (c *Client) Handle() string { return c.handle }

// Profile fetches the authenticated account's profile view.
func (c *Client) Profile(ctx context.Context) (*appbsky.ActorDefs_ProfileViewDetailed, error) {
	return appbsky.ActorGetProfile(ctx, c.api, c.did)
}

// CreatePost creates an app.bsky.feed.post record on the authenticated
// account and returns the new record's URI and CID.
func (c *Client) CreatePost(ctx context.Context, text string) (uri, cid string, err error) {
	post := &appbsky.FeedPost{
		LexiconTypeID: "app.bsky.feed.post",
		Text:          text,
		CreatedAt:      time.Now().UTC().Format(time.RFC3339Nano),
	}
	input := &comatproto.RepoCreateRecord_Input{
		Collection: "app.bsky.feed.post",
		Repo:       c.did,
		Record:     &lexutil.LexiconTypeDecoder{Val: post},
	}
	out, err := comatproto.RepoCreateRecord(ctx, c.api, input)
	if err != nil {
		return "", "", fmt.Errorf("createRecord failed: %w", err)
	}
	return out.Uri, out.Cid, nil
}

// Like creates an app.bsky.feed.like record pointing at the given post.
// uri and cid identify the post being liked (a "strong reference").
func (c *Client) Like(ctx context.Context, uri, cid string) (string, error) {
	like := &appbsky.FeedLike{
		LexiconTypeID: "app.bsky.feed.like",
		CreatedAt:      time.Now().UTC().Format(time.RFC3339Nano),
		Subject: &comatproto.RepoStrongRef{
			LexiconTypeID: "com.atproto.repo.strongRef",
			Uri:           uri,
			Cid:           cid,
		},
	}
	input := &comatproto.RepoCreateRecord_Input{
		Collection: "app.bsky.feed.like",
		Repo:       c.did,
		Record:     &lexutil.LexiconTypeDecoder{Val: like},
	}
	out, err := comatproto.RepoCreateRecord(ctx, c.api, input)
	if err != nil {
		return "", fmt.Errorf("createRecord (like) failed: %w", err)
	}
	return out.Uri, nil
}

// ResolveDirectory returns the default identity directory (DID PLC +
// did:web + DNS handle resolution), useful for resolving arbitrary
// identifiers outside of a login flow.
func ResolveDirectory() identity.Directory {
	return identity.DefaultDirectory()
}

// CreatePostWithClient creates an app.bsky.feed.post record using an arbitrary
// authenticated client (e.g. an OAuth DPoP-bound *atclient.APIClient) and the
// account's DID. This is the client-agnostic form of Client.CreatePost.
func CreatePostWithClient(ctx context.Context, c lexutil.LexClient, did, text string) (uri, cid string, err error) {
	post := &appbsky.FeedPost{
		LexiconTypeID: "app.bsky.feed.post",
		Text:          text,
		CreatedAt:      time.Now().UTC().Format(time.RFC3339Nano),
	}
	input := &comatproto.RepoCreateRecord_Input{
		Collection: "app.bsky.feed.post",
		Repo:       did,
		Record:     &lexutil.LexiconTypeDecoder{Val: post},
	}
	out, err := comatproto.RepoCreateRecord(ctx, c, input)
	if err != nil {
		return "", "", fmt.Errorf("createRecord failed: %w", err)
	}
	return out.Uri, out.Cid, nil
}

// LikeWithClient creates an app.bsky.feed.like record using an arbitrary
// authenticated client and the account's DID. This is the client-agnostic
// form of Client.Like.
func LikeWithClient(ctx context.Context, c lexutil.LexClient, did, postURI, postCID string) (string, error) {
	like := &appbsky.FeedLike{
		LexiconTypeID: "app.bsky.feed.like",
		CreatedAt:      time.Now().UTC().Format(time.RFC3339Nano),
		Subject: &comatproto.RepoStrongRef{
			LexiconTypeID: "com.atproto.repo.strongRef",
			Uri:           postURI,
			Cid:           postCID,
		},
	}
	input := &comatproto.RepoCreateRecord_Input{
		Collection: "app.bsky.feed.like",
		Repo:       did,
		Record:     &lexutil.LexiconTypeDecoder{Val: like},
	}
	out, err := comatproto.RepoCreateRecord(ctx, c, input)
	if err != nil {
		return "", fmt.Errorf("createRecord (like) failed: %w", err)
	}
	return out.Uri, nil
}
