---
Title: ATProto Firehose Demo App - Design & Implementation Guide
Ticket: ATPROTO-DEMO
Status: active
Topics:
    - atproto
    - firehose
    - backend
    - frontend
    - websocket
    - go
    - glazed
    - react
    - redux
    - jetstream
    - bsky
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: /home/manuel/code/wesen/2026-07-07--atproto-experiments/cmd/atproto-demo/main.go
      Note: glazed/cobra CLI entry (serve + firehose)
    - Path: /home/manuel/code/wesen/2026-07-07--atproto-experiments/embed.go
      Note: go:embed of frontend/dist into the binary
    - Path: /home/manuel/code/wesen/2026-07-07--atproto-experiments/frontend/src/store.ts
      Note: Redux store (feed + session slices)
    - Path: /home/manuel/code/wesen/2026-07-07--atproto-experiments/frontend/src/useFirehose.ts
      Note: WebSocket hook with reconnect
    - Path: /home/manuel/code/wesen/2026-07-07--atproto-experiments/pkg/bsky/client.go
      Note: Account client (app-password login, create post, like)
    - Path: /home/manuel/code/wesen/2026-07-07--atproto-experiments/pkg/firehose/consumer.go
      Note: Firehose subscriber (indigo events.HandleRepoStream + commit decode)
    - Path: /home/manuel/code/wesen/2026-07-07--atproto-experiments/pkg/server/server.go
      Note: HTTP server (net/http ServeMux + ring buffer + /api)
    - Path: /home/manuel/code/wesen/2026-07-07--atproto-experiments/pkg/server/ws.go
      Note: WebSocket fan-out to browsers
    - Path: repo://pkg/oauth/factory.go
      Note: OAuth DPoP login replacing app-password (Decision D3 revisited)
ExternalSources:
    - https://atproto.com/specs/sync
    - https://atproto.com/specs/event-stream
    - https://atproto.com/specs/repository
    - https://atproto.com/specs/data-model
    - https://github.com/bluesky-social/indigo
    - https://github.com/bluesky-social/jetstream
Summary: |
    A complete, intern-ready design and implementation guide for a learning application that subscribes to the ATProto firehose (the com.atproto.sync.subscribeRepos WebSocket event stream), decodes Bluesky posts from CBOR/CAR blocks, and lets the user act on their own bsky account (post, like). Covers the full ATProto architecture, the wire protocol, the Go+glazed backend, the React/Vite/Redux frontend, and a phased implementation plan with pseudocode, diagrams, and API references.
LastUpdated: 2026-07-07T00:00:00Z
WhatFor: Onboarding a new intern to build and extend the ATProto firehose demo.
WhenToUse: Read this before touching any file in pkg/ or frontend/src/.
---










# ATProto Firehose Demo App — Design & Implementation Guide

> **Audience:** a new engineer (intern) who knows Go and JavaScript but has
> never worked with ATProto, Bluesky, CBOR, or the firehose. Read this top to
> bottom before touching any code. Every claim is anchored to a spec section or
> a source file in this repository.

## 1. Executive Summary

This document describes a small but complete application that does two things:

1. **Subscribe to the Bluesky firehose** — the real-time, authenticated stream of
   every public record update across the ATProto network — and decode
   `app.bsky.feed.post` records into a live, browsable feed.
2. **Act on the user's own Bluesky account** — sign in with an app password and
   create posts and likes from the same UI.

The application is a single Go binary (built with the
[glazed](https://github.com/go-go-golems/glazed) CLI framework) that embeds a
React + Vite + Redux single-page app. The Go backend subscribes to the firehose
using the official [indigo](https://github.com/bluesky-social/indigo) SDK,
decodes the binary CBOR/CAR payloads, and fans the resulting posts out to
browsers over a WebSocket. The frontend renders the live feed and provides a
compose box backed by the user's authenticated session.

A working skeleton of every component described here already exists in this
repository and has been verified end-to-end against the live Bluesky relay: the
binary serves the SPA, connects to `wss://relay1.us-east.bsky.network`, and
decodes real posts (text, languages, CID, URI) within seconds of startup.

The guide is organized so that an intern can first *understand what ATProto is*
(Sections 2–4), then *understand the firehose wire protocol in detail*
(Sections 5–7), then *understand the application architecture* (Sections 8–10),
and finally *extend it* (Sections 11–13).

## 2. Problem Statement and Scope

### 2.1 Goal

Build a learning application that:

- Connects to the ATProto firehose without authentication.
- Decodes Bluesky `app.bsky.feed.post` records from the raw binary stream.
- Presents them in a live web UI.
- Lets the signed-in user post and like from their own account.

### 2.2 In scope

- Go backend using `net/http` (no third-party HTTP framework) and the glazed
  CLI framework for command structure and logging.
- Firehose consumption via the indigo SDK (`events`, `repo`, `atdata` packages).
- App-password authentication and record creation via the indigo `atclient`.
- React 18 + Vite 6 + Redux Toolkit frontend, embedded into the Go binary.
- A single-process, in-memory deployment (no database).

### 2.3 Out of scope (but discussed as future work)

- Full cryptographic verification of every commit signature against
  independently-resolved identity (the demo trusts the relay).
- Persistent storage / indexing of records.
- OAuth-based end-user login (we use app passwords; OAuth is the production
  path).
- Feed generation, labeling, or moderation services.
- Jetstream as the primary transport (discussed as an alternative in Section 12).

## 3. ATProto: What It Is (Current-State Analysis)

ATProto (the "Authenticated Transfer Protocol", or "atproto") is a decentralized
protocol for public conversation. The mental model in one sentence, taken from
the official docs:

> Atproto is big-world, open social. Users publish JSON records into
> repositories. The changestreams of those records then sync across the network
> to drive applications.
> — `sources/guides/understanding-atproto.md`

This section maps the protocol's moving parts. Every term below is used
repeatedly in the code, so it is worth internalizing.

### 3.1 Core primitives

- **Repository (repo).** Every account has a public, append-only, content-
  addressed data store called a *repository*. It holds all of the account's
  records. Repositories are Merkle trees (specifically, Merkle Search Trees),
  so any change to a record changes the root hash, and the whole structure is
  *self-certifying* — anyone can verify the data without trusting the server
  that delivered it. See `sources/specs/repository.md`.
- **Records.** The unit of data in a repository. A record is a JSON object
  (serialized as CBOR on the wire) categorized into a *collection*. For
  example, a Bluesky post is a record in the `app.bsky.feed.post` collection.
- **DID (Decentralized Identifier).** The permanent, account-level identifier.
  A DID looks like `did:plc:rvf22xkomx6eydkcjxdkeijb`. It never changes even if
  the user changes their handle or migrates between hosting providers. See
  `sources/specs/did.md`.
- **Handle.** The human-readable username, e.g. `alice.bsky.social`. Handles
  are DNS records and can change; DIDs cannot. See `sources/specs/handle.md`.
- **PDS (Personal Data Server).** The service that *hosts* an account's
  repository. The PDS is the authoritative source of an account's data. An
  account's current PDS is declared in its DID document.
- **Relay.** A service that subscribes to many PDS firehoses and aggregates
  them into a single "full-network" firehose. `bsky.network` operates the main
  public relay. Relays do not need to be trusted because all data is signed.
- **AppView.** A service that aggregates records into application-level views
  (e.g. "the timeline for user X"). Bluesky's official AppView backs the
  `app.bsky.*` APIs.

### 3.2 Data model and identifiers

Records are encoded in **CBOR** (Concise Binary Object Representation), using a
normalized subset called **DRISL** (successor to DAG-CBOR). When data must be
signed or hashed, it is always DRISL-CBOR; JSON is used only for human-facing
HTTP APIs and is *not* byte-deterministic. See `sources/specs/data-model.md`.

Three identifier formats appear constantly:

- **NSID (Namespace ID).** Namespaces for record types and API methods, shaped
  like `app.bsky.feed.post` or `com.atproto.sync.subscribeRepos`. They are
  reverse-DNS-style and case-normalized. See `sources/specs/nsid.md`.
- **Record Key (rkey).** The per-record identifier within a collection, e.g.
  `3mq3r32dzws25`. Records are usually keyed by a **TID** (Timestamp ID), a
  sortable base32-Sortable encoding of a microsecond timestamp, so that
  records within a collection sort chronologically. See
  `sources/specs/record-key.md` and `sources/specs/tid.md`.
- **AT URI.** The canonical reference to a record:
  `at://<authority>/<collection>/<rkey>`, e.g.
  `at://did:plc:rvf22xkomx6eydkcjxdkeijb/app.bsky.feed.post/3mq3r32dzws25`.
  The authority is a DID (durable) or handle (not durable). See
  `sources/specs/at-uri-scheme.md`.

A record is referenced *strongly* by a **CID** (Content Identifier) — a
content hash. A "strong reference" pairs an AT URI with a CID so that the
reference is both locatable and integrity-checked. The blessed CID format in
atproto is CIDv1 with the `dag-cbor` codec (0x71) and SHA-256 hash.

### 3.3 Lexicons and XRPC

A **Lexicon** is the schema language for atproto. Every record type and every
API method is defined by a Lexicon (a JSON schema with a specific structure).
For example, `app.bsky.feed.post` is a Lexicon that defines the fields of a
post (`text`, `createdAt`, `langs`, `tags`, `reply`, `embed`, …). See
`sources/specs/lexicon.md`.

**XRPC** is "HTTPS but with the routes defined by Lexicons." Instead of ad-hoc
REST endpoints, an XRPC method is identified by an NSID and a verb (`query` =
GET, `procedure` = POST). For example, `com.atproto.server.createSession` is a
POST procedure; `app.bsky.actor.getProfile` is a query. See
`sources/specs/xrpc.md`.

### 3.4 The network stack

```
   ┌─────────┐  records   ┌─────┐  firehose   ┌────────┐  /subscribe  ┌─────────┐
   │  PDS    │ ─────────▶ │Relay│ ──────────▶ │ Jetstream│ ──────────▶ │  App    │
   │ (hosts  │  per-PDS   │     │  full-net   │ (JSON)   │   (filtered)│ (this   │
   │  repos) │  firehose  │     │  firehose   │          │             │  demo)  │
   └─────────┘            └─────┘             └──────────┘             └─────────┘
        ▲                                                                       │
        │ com.atproto.repo.createRecord (app password / OAuth)                   │
        └───────────────────────────────────────────────────────────────────────┘
```

- Each **PDS** emits a firehose of its hosted repos.
- A **Relay** aggregates PDS firehoses into one full-network stream
  (`com.atproto.sync.subscribeRepos`), CBOR over WebSocket.
- **Jetstream** is an optional, non-protocol service that consumes the relay
  firehose and re-emits it as filtered JSON over WebSocket — much simpler to
  consume, but *not* self-authenticating.
- An **App** (this demo) reads from the relay/Jetstream and writes back to the
  user's PDS via authenticated XRPC.

## 4. The Firehose: Why It Exists and What It Carries

The firehose is the real-time synchronization mechanism of atproto. From
`sources/specs/sync.md`:

> A repository event stream ("firehose") provides real-time updates about
> changes to repository state (`#commit` and `#sync` events), DID documents
> and handles (`#identity` events), and account hosting status (`#account`
> events).

Anyone can connect without authentication — this is a core protocol feature.
The endpoint is `com.atproto.sync.subscribeRepos`, reached over a WebSocket:

```
wss://relay1.us-east.bsky.network/xrpc/com.atproto.sync.subscribeRepos
```

### 4.1 Event types

Every event has `seq` (a per-host, per-endpoint monotonic sequence number used
for resumption), `did` (the account), and `time` (a non-authoritative
timestamp). The message types are:

- **`#commit`** — the workhorse. A repository changed. Contains a *diff* of the
  repo as a CAR slice, plus a list of record-level operations (`ops`). This is
  where new posts appear.
- **`#sync`** — the repo state was reset (e.g. after data corruption). Contains
  only the commit block, not the records. Downstream services must re-fetch the
  full repo.
- **`#identity`** — the account's DID document or handle *may* have changed;
  downstream services should refresh their identity cache.
- **`#account`** — the account's hosting status changed (created, deleted,
  suspended, taken down, deactivated).
- **`#info`** — non-persisted informational messages (e.g. "cursor too old").

### 4.2 The `#commit` event in detail

This is the event the demo cares about. Its fields (from the indigo generated
type `SyncSubscribeRepos_Commit` in
`sources/indigo-src/syncrepos.go`):

| Field | Type | Meaning |
|---|---|---|
| `seq` | int64 | stream sequence number (resumption cursor) |
| `repo` | string | the account DID (note: named `repo`, not `did`, only here) |
| `rev` | string (TID) | the commit revision (logical clock) |
| `since` | *string (TID) | the previous commit's `rev` |
| `commit` | CID link | CID of the commit object (in `blocks`) |
| `prevData` | *CID link | root CID of the previous MST (for inversion) |
| `blocks` | bytes | a CAR "slice" containing the diff |
| `ops` | []RepoOp | record-level operations |
| `time` | string | relay-side timestamp |

Each `op` has:

| Field | Type | Meaning |
|---|---|---|
| `action` | string | `"create"`, `"update"`, or `"delete"` |
| `path` | string | `<collection>/<rkey>` |
| `cid` | *CID link | new record CID (null for delete) |
| `prev` | *CID link | previous record CID (for update/delete) |

So to find new posts, the consumer iterates `evt.Ops`, filters to
`collection == "app.bsky.feed.post"`, and for creates/updates decodes the
record bytes out of the CAR slice in `evt.Blocks`.

### 4.3 Size and rate reality

From `sources/blog-jetstream.md` and `sources/specs/sync.md`:

- The full-network firehose emits **hundreds of events per second** (and has
  exceeded a thousand during surges).
- A single WebSocket frame is hard-capped at **5 MB**; a commit's `blocks`
  field is capped at **2 MB**; at most **200 ops** per commit.
- This volume is why **filtering by collection early** (Section 9.2) is the
  single most important performance decision for a demo.

## 5. The Wire Protocol (Event Stream Spec)

This section is the part most likely to confuse a new developer, because the
firehose is *not* JSON. It is binary CBOR over WebSocket. The full spec is in
`sources/specs/event-stream.md`.

### 5.1 Framing

Each binary WebSocket frame contains **two CBOR objects concatenated**: a
*header* and a *payload*.

```
┌─────────────────────────── WebSocket binary frame ───────────────────────────┐
│  Header (CBOR)          │  Payload (CBOR)                                      │
│  { op: 1, t: "#commit"} │  { seq, repo, rev, since, commit, blocks, ops, ... } │
└──────────────────────────┴──────────────────────────────────────────────────────┘
```

The header has:
- `op` (integer): `1` = regular message, `-1` = error.
- `t` (string, only when `op == 1`): the message sub-type in short form, e.g.
  `#commit`, `#identity`, `#account`, `#sync`, `#info`.

Clients must ignore frames with unknown `op`/`t`. Invalid framing is a hard
error: drop the whole connection.

### 5.2 Sequence numbers and resumption

The stream is *reliable within a backfill window*. Each message has a `seq`.
On reconnect, a client passes `?cursor=<lastSeq>` and the server replays missed
messages (up to a window of hours/days), then continues live. Rules:

- No cursor → start from "now".
- Cursor in the future → error + close.
- Cursor in window → replay then continue.
- Cursor too old → an `#info` message, then the oldest available, then live.

**Scope of `seq`:** sequence numbers are scoped to the combination of *host*
and *endpoint*. They are not comparable across different relays. This is why
the demo persists `lastSeq` per relay and resumes from it.

### 5.3 Connection lifecycle

- Use `wss://` (TLS) always in production.
- Either side may close an idle connection.
- The server may send a "too slow" error and close if the client can't keep up.
- HTTP-level errors (405, 426, 429, 5xx) are returned before the WebSocket
  upgrade; clients must be robust to non-JSON error bodies (e.g. load-balancer
  pages).

## 6. Repositories, CAR Files, and MST (What `blocks` Actually Is)

To decode a post, you must understand what `evt.Blocks` contains. From
`sources/specs/repository.md`:

A repository is a key/value map (path → record) stored in a **Merkle Search
Tree (MST)**. The tree's root hash is the `data` field of a signed **commit
object**. The commit object also has `did`, `rev`, `prev`, and `sig` (the
signature).

### 6.1 CAR files

A complete repository (or a diff) is serialized as a **CAR** (Content
Addressed aRchive) file. A CAR is: a small header listing one or more "root"
CIDs, followed by a stream of `(CID, block)` pairs. In a firehose `#commit`:

- The CAR header's first root is the new commit's CID.
- The blocks include the new commit object, the new/changed MST nodes, and the
  new/changed record blocks.
- Deleted records are *not* included.

### 6.2 Operation inversion (why `prevData` exists)

The diff is verifiable in isolation via *operation inversion*: apply the `ops`
in reverse against the partial MST in the diff, recompute the root hash, and it
should equal the *previous* commit's `data` (provided in `prevData`). This lets
a consumer detect missing or tampered ops without holding the full tree. The
demo does not perform full inversion; it relies on indigo's
`repo.VerifyCommitMessage` for structural validation.

## 7. The indigo Go SDK (Reference Implementation)

indigo is Bluesky's official Go implementation. It is "the most feature-complete
SDK for interacting with the firehose directly" (`sources/guides/streaming-data.md`).
The packages this demo uses:

| Package | Purpose |
|---|---|
| `api/atproto` | generated types for `com.atproto.*` (e.g. `SyncSubscribeRepos_Commit`) |
| `api/bsky` | generated types for `app.bsky.*` (e.g. `FeedPost`, `FeedLike`) |
| `atproto/repo` | `VerifyCommitMessage`, `GetRecordBytes`, MST/CAR handling |
| `atproto/atdata` | generic CBOR→`map[string]any` decoding |
| `atproto/syntax` | parsers for NSID, RecordKey, AT URI, repo paths |
| `atproto/atclient` | HTTP XRPC client + app-password login |
| `atproto/identity` | DID/handle resolution |
| `events` | `RepoStreamCallbacks`, `HandleRepoStream`, `XRPCStreamEvent` |
| `events/schedulers/{sequential,parallel}` | per-repo-ordered event scheduling |
| `lex/util` | `LexLink`, `LexBytes`, `LexiconTypeDecoder` |

### 7.1 The consumer pattern (from `sources/indigo-src/consumer.go`)

indigo provides a callback struct and a stream driver:

```go
// events/consumer.go
type RepoStreamCallbacks struct {
    RepoCommit   func(evt *comatproto.SyncSubscribeRepos_Commit) error
    RepoSync     func(evt *comatproto.SyncSubscribeRepos_Sync) error
    RepoIdentity func(evt *comatproto.SyncSubscribeRepos_Identity) error
    RepoAccount  func(evt *comatproto.SyncSubscribeRepos_Account) error
    RepoInfo     func(evt *comatproto.SyncSubscribeRepos_Info) error
    Error        func(evt *ErrorFrame) error
}

func HandleRepoStream(ctx context.Context, con *websocket.Conn,
    sched Scheduler, log *slog.Logger) error
```

`HandleRepoStream` owns the read loop: it reads each WebSocket frame, splits the
two CBOR objects, decodes the header, then decodes the payload into the right
generated type, and dispatches to the scheduler. The scheduler calls the
callback. A **sequential** scheduler processes events one at a time; a
**parallel** scheduler fans out across workers while preserving per-repo
ordering (events for the same `repo` are never reordered).

### 7.2 The canonical connection loop (from `sources/indigo-src/tap-firehose.go`)

The reference tool `tap` shows the production-grade loop: rewrite the URL scheme
to `wss`, set the path, append `?cursor=<seq>`, dial with backoff, and on
failure retry. This is exactly what `pkg/firehose/consumer.go` implements.

## 8. Application Architecture

### 8.1 Component diagram

```
┌─────────────────────────────── Go binary (atproto-demo) ───────────────────────────────┐
│                                                                                         │
│  cmd/atproto-demo ── glazed/cobra ── serve | firehose                                    │
│         │                                                                               │
│         ├── pkg/firehose.Consumer ── wss://relay ── com.atproto.sync.subscribeRepos     │
│         │        │  (indigo events.HandleRepoStream + parallel.Scheduler)               │
│         │        │  verify commit → walk CAR → decode app.bsky.feed.post                │
│         │        ▼                                                                       │
│         │     Post channel ──────────────┐                                              │
│         │                                 ▼                                              │
│         └── pkg/server.Server ── net/http.ServeMux                                       │
│                  │  ring buffer (200 recent posts)                                       │
│                  │  /api/posts   /api/status   /api/login   /api/post   /api/like        │
│                  │  /ws  (WebSocket fan-out to browsers)                                 │
│                  │                                                                       │
│                  └── pkg/bsky.Client ── com.atproto.server.createSession (app password) │
│                                  └── com.atproto.repo.createRecord (post / like)         │
│                                                                                         │
│  embed.go ── go:embed all:frontend/dist ──► served at "/"                                │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                        ▲
                                        │ HTTP + WebSocket
                                        ▼
┌──────────────────────── Browser ────────────────────────┐
│  React 18 + Vite 6 + Redux Toolkit                       │
│   store.ts ── feedSlice (capped 500) + sessionSlice     │
│   useFirehose.ts ── /ws WebSocket (reconnect + backoff) │
│   Feed.tsx ── live post list                             │
│   AccountPanel.tsx ── login + compose box                │
└──────────────────────────────────────────────────────────┘
```

### 8.2 Data flow: a post from creation to screen

1. **Author's PDS** commits a new `app.bsky.feed.post` record to the author's
   repo, signs the commit, and emits a `#commit` on its PDS firehose.
2. **Relay** (`relay1.us-east.bsky.network`) aggregates it and re-emits it on
   the full-network firehose with a new `seq`.
3. **`pkg/firehose.Consumer`** receives the WebSocket frame; indigo's
   `HandleRepoStream` decodes the header (`op=1, t="#commit"`) and the
   `SyncSubscribeRepos_Commit` payload.
4. The consumer calls `repo.VerifyCommitMessage` to parse the CAR slice into a
   partial MST, then for each `op` with `collection == "app.bsky.feed.post"` it
   calls `r.GetRecordBytes(collection, rkey)` and
   `atdata.UnmarshalCBOR(recBytes)` to get the record fields.
5. The consumer builds a `Post` struct and broadcasts it to all subscribers.
6. **`pkg/server.Server`** (a subscriber) appends it to the ring buffer and
   fans it out to every connected `/ws` client as a JSON text frame.
7. **`useFirehose.ts`** receives the frame, `JSON.parse`es it, and dispatches
   `postReceived` into the Redux store.
8. **`Feed.tsx`** re-renders with the new post at the top.

### 8.3 Data flow: the user posts from the UI

1. **`AccountPanel.tsx`** collects handle + app password, POSTs to `/api/login`.
2. **`pkg/server`** calls `bsky.Login` → `atclient.LoginWithPasswordHost` →
   `com.atproto.server.createSession`, stores the authenticated client.
3. The compose box POSTs text to `/api/post`.
4. **`pkg/server`** calls `client.CreatePost` → builds an `appbsky.FeedPost`
   record and calls `comatproto.RepoCreateRecord` against the user's PDS.
5. The PDS writes the record, signs a new commit, and emits it on the firehose.
6. Within a second or two, the user's own post comes back through the firehose
   and appears in the live feed — a satisfying end-to-end loop.

## 9. Backend Design (Go)

### 9.1 `pkg/firehose/consumer.go` — the subscriber

The `Consumer` type owns the connection lifecycle and a set of subscribers.

**Connection + resumption** (`Consumer.Run`):

```go
u, _ := url.Parse(relayURL)
u.Scheme = "wss" // https -> wss
u.Path  = "/xrpc/com.atproto.sync.subscribeRepos"
for {
    if seq := c.LastSeq(); seq > 0 {
        u.RawQuery = fmt.Sprintf("cursor=%d", seq) // resume
    }
    con, _, err := websocket.DefaultDialer.DialContext(ctx, u.String(), nil)
    if err != nil { sleep(backoff(retries)); retries++; continue }
    retries = 0
    rsc := &events.RepoStreamCallbacks{
        RepoCommit: c.handleCommit,
    }
    sched := parallel.NewScheduler(8, 100, relayURL, rsc.EventHandler)
    events.HandleRepoStream(ctx, con, sched, c.logger) // blocks until disconnect
}
```

**Commit handling** (`handleCommit`):

```go
r, err := repo.VerifyCommitMessage(ctx, evt) // parse CAR slice -> *repo.Repo
if err != nil { return nil }                 // skip malformed, don't kill stream
for _, op := range evt.Ops {
    collection, rkey, _ := syntax.ParseRepoPath(op.Path)
    if collection.String() != "app.bsky.feed.post" { continue } // FILTER EARLY
    p := Post{Did: evt.Repo, Rkey: rkey.String(),
              URI: "at://"+evt.Repo+"/"+op.Path, Action: op.Action,
              Seq: evt.Seq, Time: evt.Time}
    if op.Cid != nil { p.CID = op.Cid.String() }
    if op.Action == "create" || op.Action == "update" {
        recBytes, _, _ := r.GetRecordBytes(ctx, collection, rkey)
        rec, _ := atdata.UnmarshalCBOR(recBytes) // map[string]any
        p.Text = stringField(rec, "text")
        p.CreatedAt = stringField(rec, "createdAt")
        p.Langs = stringSliceField(rec, "langs")
        p.Tags = stringSliceField(rec, "tags")
    }
    c.broadcast(p)
}
```

> **Why `map[string]any` instead of the typed `appbsky.FeedPost`?** The record
> bytes are raw CBOR. `atdata.UnmarshalCBOR` gives a generic map, which is
> robust to schema additions and avoids depending on cborgen internals. To get
> the fully-typed struct, re-marshal the map to JSON (atdata's `Bytes`/`CIDLink`
> types implement `MarshalJSON`) and `json.Unmarshal` into `*appbsky.FeedPost`.
> The demo extracts the few fields it needs by hand. See Decision D2.

**Fan-out** (`broadcast`): the consumer keeps a `map[int]chan Post`. On each
post it snapshots the channels and does a non-blocking send (`select` with a
`default`), so a slow subscriber is dropped rather than blocking the firehose.

### 9.2 `pkg/bsky/client.go` — the account actor

```go
api, err := atclient.LoginWithPasswordHost(ctx, host, identifier, password, "", nil)
// api implements lexutil.LexClient; api.Get / api.Post do XRPC calls.

func (c *Client) CreatePost(ctx, text) (uri, cid string, err error) {
    post := &appbsky.FeedPost{
        LexiconTypeID: "app.bsky.feed.post",
        Text: text, CreatedAt: time.Now().UTC().Format(time.RFC3339Nano),
    }
    out, err := comatproto.RepoCreateRecord(ctx, c.api, &comatproto.RepoCreateRecord_Input{
        Collection: "app.bsky.feed.post",
        Repo: c.did,
        Record: &lexutil.LexiconTypeDecoder{Val: post},
    })
    return out.Uri, out.Cid, err
}
```

`Like` is identical but creates an `app.bsky.feed.like` record whose `Subject`
is a `com.atproto.repo.strongRef` (URI + CID) pointing at the liked post.

### 9.3 `pkg/server/server.go` + `ws.go` — the HTTP surface

Uses only `net/http.ServeMux` with Go 1.22+ method+pattern routing:

```go
mux.HandleFunc("GET /api/posts",  s.handlePosts)
mux.HandleFunc("GET /api/status", s.handleStatus)
mux.HandleFunc("POST /api/login", s.handleLogin)
mux.HandleFunc("POST /api/post",   s.handlePost)
mux.HandleFunc("POST /api/like",   s.handleLike)
mux.HandleFunc("GET /ws",         s.handleWS)
```

The server is itself a `firehose.Consumer` subscriber. It keeps a 200-entry ring
buffer (so a freshly-connected client sees recent history) and fans live posts
to every `/ws` client. The WebSocket handler (`ws.go`) upgrades with
`gorilla/websocket`, sends the ring-buffer snapshot, then pumps live frames with
a 30s ping keepalive.

### 9.4 `cmd/atproto-demo/main.go` + `embed.go` — the CLI

glazed provides the cobra root, logging (`--log-level`), and the help system.
Two subcommands: `serve` (HTTP + firehose) and `firehose` (stdout JSON lines,
handy for debugging). `embed.go` lives at the repo root because `go:embed`
paths cannot ascend with `..`; it embeds `frontend/dist` into the binary.

## 10. Frontend Design (React + Vite + Redux)

### 10.1 State shape (`store.ts`)

Two Redux Toolkit slices:

- **`feedSlice`** — `Post[]`, capped at 500, newest first. Actions:
  `postReceived` (prepend one), `postsReceived` (merge a snapshot batch,
  dedup by URI, sort by `seq`).
- **`sessionSlice`** — login + posting UI state (`status`, `error`,
  `postStatus`, `postError`).

### 10.2 The WebSocket hook (`useFirehose.ts`)

Opens `ws://<host>/ws`, dispatches each frame as `postReceived`, and reconnects
with exponential backoff. Seeds the feed with a `/api/posts` snapshot on mount
so the UI isn't empty before the first live event.

### 10.3 Components

- **`Feed.tsx`** — renders the post list, shows a rough events/sec estimate
  over the last 5s, formats DIDs and relative times.
- **`AccountPanel.tsx`** — login form (handle + app password) and, once logged
  in, a compose box that POSTs to `/api/post`.

### 10.4 Dev vs production

- **Dev:** `pnpm dev` runs Vite on :5173; `vite.config.ts` proxies `/api` and
  `/ws` to :8080 where the Go server runs. Hot reload works.
- **Prod:** `pnpm build` emits `frontend/dist`; `go build` embeds it; the
  single binary serves everything from one port.

## 11. Decision Records

### Decision: D1 — Use the raw relay firehose, not Jetstream, as the primary transport

- **Context:** Jetstream (JSON, filterable, simpler) is the recommended starting
  point for casual projects. The raw firehose is CBOR/CAR and complex.
- **Options considered:** (a) Jetstream only; (b) raw firehose only; (c) both,
  selectable by flag.
- **Decision:** Raw firehose as the default, with Jetstream documented as an
  alternative (Section 12).
- **Rationale:** The goal is *learning ATProto*, including the self-authenticating
  data model. Jetstream strips signatures and MST nodes, hiding the most
  instructive parts. indigo is "the most feature-complete SDK for interacting
  with the firehose directly."
- **Consequences:** More complex decoding; the demo trusts the relay for
  signature verification (acceptable for learning, not for production
  mirroring/moderation). Must handle CBOR/CAR.
- **Status:** accepted

### Decision: D2 — Decode records to `map[string]any`, not the typed `appbsky.FeedPost`

- **Context:** Record bytes are raw CBOR. Two decode paths exist: generic
  (`atdata.UnmarshalCBOR` → `map[string]any`) or typed (re-marshal to JSON,
  then `json.Unmarshal` into `*appbsky.FeedPost`).
- **Options considered:** (a) generic map; (b) typed struct; (c) both.
- **Decision:** Generic map, extracting the few needed fields by hand.
- **Rationale:** Robust to schema additions; no dependency on cborgen internals;
  the demo only needs `text`, `createdAt`, `langs`, `tags`. The typed path is
  documented inline for when full validation is needed.
- **Consequences:** No Lexicon validation (acceptable for a read-only feed
  display). To validate, pull the Lexicon and validate the map.
- **Status:** accepted

### Decision: D3 — App-password auth, not OAuth

- **Context:** End-user apps should use OAuth; bots/CLIs may use app passwords.
- **Options considered:** (a) app password; (b) OAuth; (c) both.
- **Decision:** App password for the demo.
- **Rationale:** OAuth (see `sources/specs/oauth.md`, 51 KB) is a substantial
  implementation (PKCE, dynamic client registration, DID-based consent). App
  passwords are a single XRPC call and are explicitly sanctioned for
  single-purpose tools.
- **Consequences:** The user must create an app password at
  bsky.app/settings. Not suitable for a multi-user public deployment.
- **Status:** accepted (revisit for production)

### Decision: D4 — `net/http.ServeMux`, no third-party HTTP framework

- **Context:** Go 1.22+ added method+pattern routing to the standard library.
- **Options considered:** (a) stdlib `ServeMux`; (b) chi/echo/gin.
- **Decision:** stdlib only.
- **Rationale:** Project convention (go-web-frontend-embed skill); fewer
  dependencies; the routing needs are trivial.
- **Consequences:** None significant for this scope.
- **Status:** accepted

### Decision: D5 — In-memory ring buffer, no database

- **Context:** A demo needs recent history but not durable storage.
- **Options considered:** (a) in-memory ring; (b) SQLite; (c) Postgres.
- **Decision:** In-memory ring buffer (200 posts server-side, 500 client-side).
- **Rationale:** Zero operational complexity; restart loses history, which is
  fine for a learning tool.
- **Consequences:** No backfill across restarts; cursor resumption only covers
  the relay's backfill window. Production indexing needs the record-level sync
  pattern from `sources/specs/sync.md` (Section "Record-Level Synchronization").
- **Status:** accepted

### Decision: D6 — Parallel scheduler, 8 workers

- **Context:** indigo offers sequential and parallel schedulers.
- **Options considered:** (a) sequential; (b) parallel.
- **Decision:** Parallel, 8 workers.
- **Rationale:** The full-network firehose is hundreds of events/sec; a single
  goroutine can fall behind during CAR decoding. The parallel scheduler
  preserves per-repo ordering, so correctness is maintained.
- **Consequences:** Slightly more complex reasoning; events for different repos
  may be processed concurrently (fine, since the demo has no cross-repo state).
- **Status:** accepted

## 12. Alternatives Considered

### 12.1 Jetstream (the simpler alternative)

Jetstream consumes the relay firehose and re-emits it as **JSON** over
WebSocket, with server-side filtering by collection and DID:

```
wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post
```

Each message is a JSON object with `type` (`commit`/`identity`/`account`),
`did`, `time_us`, and a `commit` containing `collection`, `rkey`, `cid`, `rev`,
and the decoded `record` as plain JSON. No CBOR, no CAR, no MST.

**Tradeoffs** (from `sources/blog-jetstream.md`):

- ✅ Trivial to consume (any WebSocket client, plain JSON).
- ✅ Server-side filtering slashes bandwidth (>99% reduction for narrow use
  cases).
- ❌ **Not self-authenticating** — no signatures, no MST nodes. You trust the
  Jetstream operator.
- ❌ Not part of the protocol; not a stable long-term API.
- ❌ Not suitable for mirroring, backups, moderation, or "who said what"
  integrity.

**When to switch:** if the demo's goal shifts from "learn the protocol" to
"ship a fun bot fast," add a `--jetstream` flag that swaps the consumer for a
plain JSON WebSocket reader. The `Post` struct and everything downstream stays
the same.

### 12.2 TypeScript SDK instead of Go

The official TypeScript SDK (`@atproto/*`) is the most complete overall and
has the simplest firehose story via `@atproto/xrpc-server` + `@atproto/repo`.
Rejected because the project standardizes on Go + glazed for backends.

### 12.3 Direct PDS subscription instead of a relay

You can subscribe to a single PDS's firehose to get only that PDS's accounts.
Rejected for the demo because the interesting "whole network" view requires a
relay, and relays are free and unauthenticated.

## 13. Implementation Plan (Phased)

The skeleton for Phases 1–3 already exists and runs. Phases 4–6 are the
recommended next steps for an intern.

### Phase 1 — Firehose consumer (DONE)

- `pkg/firehose/consumer.go`: dial, resumption, backoff, commit decode.
- Verified: real posts decoded from `relay1.us-east.bsky.network`.

### Phase 2 — HTTP server + WebSocket fan-out (DONE)

- `pkg/server/server.go`, `pkg/server/ws.go`: ServeMux routes, ring buffer,
  `/ws` fan-out.
- Verified: `/api/posts` and `/api/status` return live data.

### Phase 3 — Frontend (DONE)

- `frontend/`: React + Vite + Redux, `useFirehose`, `Feed`, `AccountPanel`.
- Verified: `pnpm build` succeeds; SPA embedded and served.

### Phase 4 — Account actions (PARTIAL: post + like exist; needs UI wiring)

- Wire `AccountPanel` like button to `/api/like` (pass the post's `uri`+`cid`).
- Add profile fetch (`app.bsky.actor.getProfile`) to show the logged-in user.
- Add reply support: `FeedPost.Reply` with `root`/`parent` strong refs.

### Phase 5 — Robustness

- Persist `lastSeq` to disk so restart resumes (not just in-memory).
- Add `#identity` and `#account` handling (update a DID→handle cache).
- Add commit signature verification against resolved identity
  (`repo.VerifyCommitSignature` + `identity.DefaultDirectory()`).
- Add rate limiting / size guards per the sync spec's validation checklist.

### Phase 6 — Beyond posts

- Subscribe to additional collections (`app.bsky.feed.like`,
  `app.bsky.graph.follow`) by extending the collection filter.
- Build a "who follows whom" graph view.
- Add a simple search/filter box over the in-memory feed.
- Experiment with a custom Lexicon (e.g. a `status` record) end-to-end.

## 14. Test Strategy

- **Unit (Go):** `pkg/firehose` — feed a recorded `#commit` event (use the
  fixtures in indigo at `atproto/repo/testdata/firehose_commit_*.json`, or
  capture one with the `firehose` subcommand) and assert the decoded `Post`.
  Mock the WebSocket with a `net.Pipe` reader serving two CBOR objects.
- **Unit (frontend):** `store.ts` reducers — assert `postReceived` caps at
  500 and `postsReceived` dedups by URI.
- **Integration:** start `serve` against the live relay, assert
  `/api/status` `lastSeq` increases and `/api/posts` is non-empty within 10s.
- **Manual:** log in with an app password, post, observe the post round-trip
  through the firehose into the feed.
- **Property:** the consumer must never panic on malformed input (every decode
  error is logged and skipped, not returned fatally).

## 15. Risks, Open Questions, and Gotchas

### 15.1 Risks

- **Firehose volume:** hundreds of events/sec can overwhelm a slow consumer or
  browser. Mitigations: filter by collection early; non-blocking channel sends;
  cap the client-side feed; consider Jetstream for narrow use cases.
- **Trust:** the demo does not verify commit signatures. A malicious or buggy
  relay could inject fake posts. Do not use this code for moderation or
  archival integrity without adding verification (Phase 5).
- **App password handling:** the password is sent to the Go server and held in
  memory. For any non-local deployment, use OAuth and never handle passwords.
- **`seq` scope:** sequence numbers are per-relay. Switching relays (or
  failing over) invalidates the cursor. The demo pins one relay.

### 15.2 Gotchas (things that will bite you)

- **`#commit` uses `repo`, not `did`.** Every other event type names the
  account field `did`; `#commit` calls it `repo`. The indigo type reflects
  this (`evt.Repo`). See `sources/specs/sync.md`.
- **`go:embed` cannot use `..`.** That is why `embed.go` lives at the repo
  root, not in `pkg/embed/`. If you move it, the build breaks.
- **glazed logging flags must be registered.** `logging.InitLoggerFromCobra`
  reads `--log-level`; you must call
  `logging.AddLoggingSectionToRootCommand(rootCmd, appName)` in `main()` or
  every subcommand fails with "flag accessed but not defined: log-level".
- **`prevData` may be null.** Older relays/commits omit `prevData`, which
  limits MST inversion. The consumer logs and skips the root check. Use a
  relay that provides `prevData` (e.g. `relay1.us-east.bsky.network`), per
  the note in `sources/bsky-firehose-guide.md`.
- **Records can be larger than expected.** Enforce size limits before
  decoding untrusted CBOR (the sync spec's validation checklist).
- **`bsky.network` vs `relay1.us-east.bsky.network`.** The bare `bsky.network`
  endpoint does not always provide `prevData`; prefer the numbered relays.
- **Reference `.go` files in `sources/indigo-src/` are excluded from the
  build** with `//go:build ignore`. They are study material, not compiled.

### 15.3 Open questions

- Should the demo add Jetstream as a `--transport=jetstream|firehose` flag?
  (Recommended for the "fun bot" path; see Section 12.1.)
- How much verification is worth the complexity for a learning tool? (Phase 5
  proposes signature verification as opt-in.)
- Should the frontend show `#identity`/`#account` events (e.g. a live "new
  accounts" counter) to make the non-commit events tangible?

## 16. References

### 16.1 ATProto specifications (downloaded to `sources/specs/`)

- `sync.md` — Data synchronization, firehose event types, validation checklist.
- `event-stream.md` — WebSocket + CBOR framing, sequence numbers, resumption.
- `repository.md` — MST, commit objects, CAR files, operation inversion.
- `data-model.md` — DRISL-CBOR, CID formats, the `blob`/`link`/`bytes` types.
- `lexicon.md` — the schema language.
- `nsid.md`, `at-uri-scheme.md`, `record-key.md`, `tid.md` — identifiers.
- `did.md`, `handle.md` — identity.
- `xrpc.md` — the HTTP API layer.
- `oauth.md` — the production auth path (not used by the demo).
- `account.md`, `label.md`, `blob.md`, `cryptography.md` — supporting specs.

### 16.2 ATProto guides (downloaded to `sources/guides/`)

- `streaming-data.md` — the firehose + Jetstream overview.
- `understanding-atproto.md`, `the-at-stack.md` — the big picture.
- `bot-tutorial.md` — building a bot (TS; the concepts transfer to Go).
- `reads-and-writes.md`, `auth.md`, `sync.md` — API and auth guides.

### 16.3 indigo reference source (downloaded to `sources/indigo-src/`)

- `events.go` — `XRPCStreamEvent`, `EventManager`, serialization.
- `consumer.go` — `RepoStreamCallbacks`, `HandleRepoStream`.
- `syncrepos.go` — `SyncSubscribeRepos_Commit` / `_RepoOp` types.
- `feedpost.go` — the `app.bsky.feed.post` record type.
- `tap-firehose.go` — the canonical connection + commit-processing loop.
- `sequential.go` — the sequential scheduler.

### 16.4 This repository's source files

- `pkg/firehose/consumer.go` — firehose subscriber.
- `pkg/bsky/client.go` — account client (login, post, like).
- `pkg/server/server.go`, `pkg/server/ws.go` — HTTP + WebSocket server.
- `cmd/atproto-demo/main.go` — glazed/cobra entry point.
- `embed.go` — SPA embedding.
- `frontend/src/store.ts`, `useFirehose.ts`, `Feed.tsx`, `AccountPanel.tsx`.

### 16.5 External links

- Protocol site: https://atproto.com/
- Bluesky API docs: https://docs.bsky.app/
- indigo (Go SDK): https://github.com/bluesky-social/indigo
- Jetstream: https://github.com/bluesky-social/jetstream
- glazed framework: https://github.com/go-go-golems/glazed
