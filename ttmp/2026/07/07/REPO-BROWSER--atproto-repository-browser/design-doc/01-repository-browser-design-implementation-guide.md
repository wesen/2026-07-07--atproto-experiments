---
Title: Repository Browser - Design & Implementation Guide
Ticket: REPO-BROWSER
Status: active
Topics:
    - atproto
    - repository
    - frontend
    - backend
    - bsky
    - go
    - react
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - /home/manuel/code/wesen/2026-07-07--atproto-experiments/pkg/repobrowser/browser.go
    - /home/manuel/code/wesen/2026-07-07--atproto-experiments/pkg/server/server.go
    - /home/manuel/code/wesen/2026-07-07--atproto-experiments/frontend/src/RepoBrowser.tsx
    - /home/manuel/code/wesen/2026-07-07--atproto-experiments/frontend/src/App.tsx
ExternalSources:
    - https://atproto.com/specs/repository
    - https://atproto.com/specs/sync
    - https://atproto.com/specs/at-uri-scheme
    - https://github.com/bluesky-social/indigo
Summary: >
  A complete, intern-ready design and implementation guide for a repository
  browser page that walks any public ATProto repository by handle or DID:
  describe the repo, list collections, paginate records within a collection,
  and fetch a single record's decoded value. Covers the repository data model,
  the XRPC read APIs, the Go browser package, the HTTP server routes, the
  React three-column UI, and a phased plan with pseudocode, diagrams, and
  API references.
LastUpdated: 2026-07-07
WhatFor: "Onboarding a new intern to build and extend the repository browser."
WhenToUse: "Read this before touching pkg/repobrowser/ or frontend/src/RepoBrowser.tsx."
---

# Repository Browser — Design & Implementation Guide

> **Audience:** a new engineer (intern) who has read the firehose demo design
> guide and understands ATProto basics (DIDs, handles, repos, records, XRPC).
> This guide adds the read side: how to walk a repository via the public XRPC
> read APIs. Every claim is anchored to a spec section or a source file.

## 1. Executive Summary

This document describes a second page in the ATProto demo application: a
**repository browser**. The user enters a handle or DID, the application
describes the repository (listing its collections), lets the user pick a
collection and paginate through its records, and shows the fully decoded JSON
of a selected record. The browser works on **any public repository** — reads
are unauthenticated — and uses the authenticated OAuth session when the user
browses their own repo.

A working implementation already exists and has been verified end-to-end:
describing `atproto.com` returns 25 collections, listing `app.bsky.feed.post`
returns 50 records with correct record keys, and fetching a record returns its
decoded value (`$type`, `text`, `createdAt`, `embed`, …) as JSON. The browser
has zero console errors in Playwright.

The guide is organized so an intern can first *understand what a repository is*
(Sections 2–4), then *understand the read APIs* (Section 5), then *understand
the application architecture* (Sections 6–8), and finally *extend it*
(Sections 9–11).

## 2. Problem Statement and Scope

### 2.1 Goal

Build a page that lets a user walk through any ATProto repository and inspect
every record in it: collections → records → record detail.

### 2.2 In scope

- Describe a repo (DID, handle, collection list).
- Paginate records within a collection.
- Fetch and render a single record's decoded value.
- Browse any public repo by handle or DID (unauthenticated reads).
- Use the OAuth session for the logged-in user's own repo.

### 2.3 Out of scope

- Writing or mutating records (the firehose demo's post/like covers writes).
- Verifying repository integrity (MST root, commit signatures).
- Streaming repo updates (the firehose page covers live updates).
- Full CAR export / bulk download.

## 3. What a Repository Is (Current-State Analysis)

An ATProto account's repository is a content-addressed, public, key/value
mapping. The keys are paths of the form `<collection>/<record-key>`. The
values are records (CBOR objects, JSON over HTTP). The whole structure is a
Merkle Search Tree so that the root hash changes on every mutation and the
data is self-certifying. See `sources/specs/repository.md`.

This section defines the terms the rest of the guide uses.

### 3.1 Collection

A collection is a namespace for records of the same type, identified by an
**NSID** (Namespace ID), e.g. `app.bsky.feed.post` (Bluesky posts),
`app.bsky.feed.like` (likes), `app.bsky.graph.follow` (follows),
`app.bsky.actor.profile` (the account's profile). A repo can contain any number
of collections, including custom (non-`app.bsky.*`) ones.

### 3.2 Record key (rkey)

Within a collection, each record has a **record key** (rkey), usually a **TID**
(Timestamp ID) so records sort chronologically. A record's path is
`<collection>/<rkey>`, e.g. `app.bsky.feed.post/3mq2pgvpmqs27`.

### 3.3 Record

A record is a JSON object (CBOR on the wire) with a `$type` field naming its
Lexicon. For example, a post record has `$type: "app.bsky.feed.post"`,
`text`, `createdAt`, optional `embed`, `langs`, `tags`, `reply`.

### 3.4 AT URI

The canonical reference to a record is an AT URI:
`at://<authority>/<collection>/<rkey>`. The authority is a DID (durable) or
handle (not durable). Example:
`at://did:plc:ewvi7nxzyoun6zhxrhs64oiz/app.bsky.feed.post/3mq2pgvpmqs27`.
See `sources/specs/at-uri-scheme.md`.

> **Gotcha:** Go's `net/url` cannot parse AT URIs. The colons in a DID
> (`did:plc:...`) confuse `net/url`'s host:port splitting, so the path comes
> out wrong. The implementation splits the URI manually. This is documented in
> the at-uri spec ("the Golang net/url package does not work").

### 3.5 CID

Every record has a **CID** (content identifier, a SHA-256 hash). A "strong
reference" pairs an AT URI with a CID. The browser shows CIDs so the user can
see the content-addressed identity of each record.

### 3.6 Where the repo lives

The authoritative host for an account's repo is the account's **PDS**
(Personal Data Server), declared in the DID document. To read a repo, resolve
the handle/DID to its PDS endpoint and query the PDS. Reads are public and
unauthenticated.

## 4. The Network Read Path

```
   handle/DID
       │  identity.Directory.Lookup (DID PLC / did:web / DNS handle)
       ▼
   DID + PDS host
       │  atclient.NewAPIClient(host)  (unauthenticated)
       ▼
   PDS  ── com.atproto.repo.describeRepo ──▶  collections list
       ├── com.atproto.repo.listRecords  ──▶  paginated records (uri, cid, value)
       └── com.atproto.repo.getRecord    ──▶  single record value
```

The three XRPC queries are the entire read surface the browser needs. They are
all `query` verbs (HTTP GET) under the `com.atproto.repo.*` namespace.

## 5. The XRPC Read APIs

These are the indigo-generated functions the browser calls. All take a
`lexutil.LexClient` (an authenticated client or a plain PDS client) and return
typed structs.

### 5.1 `com.atproto.repo.describeRepo`

```go
func RepoDescribeRepo(ctx context.Context, c lexutil.LexClient, repo string) (*RepoDescribeRepo_Output, error)

type RepoDescribeRepo_Output struct {
    Collections     []string `json:"collections"`
    Did             string   `json:"did"`
    DidDoc          interface{} `json:"didDoc"`
    Handle          string   `json:"handle"`
    HandleIsCorrect bool     `json:"handleIsCorrect"`
}
```

`repo` is a handle or DID. Returns the list of collections the repo contains,
plus the DID, handle, and whether the handle resolves correctly. This is the
entry point: it tells the UI which collections to show.

### 5.2 `com.atproto.repo.listRecords`

```go
func RepoListRecords(ctx context.Context, c lexutil.LexClient,
    collection string, cursor string, limit int64, repo string, reverse bool,
) (*RepoListRecords_Output, error

type RepoListRecords_Record struct {
    Cid   string                      `json:"cid"`
    Uri   string                      `json:"uri"`
    Value *lexutil.LexiconTypeDecoder `json:"value"`
}
```

Paginated: `cursor` is a TID for the next page; `limit` caps the page (≤100);
`reverse` returns oldest-first. Each record has a `uri` (AT URI), `cid`, and
`value` (the decoded record). The browser lists records by `uri`/`cid` first
and fetches the full `value` on demand to keep list responses small.

### 5.3 `com.atproto.repo.getRecord`

```go
func RepoGetRecord(ctx context.Context, c lexutil.LexClient,
    cid string, collection string, repo string, rkey string,
) (*RepoGetRecord_Output, error)

type RepoGetRecord_Output struct {
    Cid   *string                     `json:"cid,omitempty"`
    Uri   string                      `json:"uri"`
    Value *lexutil.LexiconTypeDecoder `json:"value"`
}
```

Fetches a single record by `repo` + `collection` + `rkey`. The optional `cid`
requests a specific version. `Value` is a `LexiconTypeDecoder` whose underlying
value marshals to the record's JSON.

### 5.4 Identity resolution

To reach the PDS, the browser resolves the handle/DID via
`identity.DefaultDirectory()`, which checks DID PLC, `did:web`, and DNS handle
records. `ident.PDSEndpoint()` returns the PDS base URL from the DID document.
A plain `atclient.NewAPIClient(host)` is then used for unauthenticated reads.

## 6. Application Architecture

### 6.1 Component diagram

```
┌────────────────── Browser tab ──────────────────┐
│  RepoBrowser.tsx (3-column: collections/records/│
│  detail)                                         │
│   │ fetch                                        │
│   ▼                                              │
│  /api/repo/describe  /api/repo/records  /api/repo/record
│   │                                              │
│   ▼                                              │
│  pkg/server/server.go (handleRepo*)             │
│   │                                              │
│   ▼                                              │
│  pkg/repobrowser/Browser                         │
│   ├── identity.Directory.Lookup (handle/DID)    │
│   ├── atclient.NewAPIClient(pds)  (or OAuth)     │
│   └── com.atproto.repo.{describe,listRecords,getRecord}
└──────────────────────────────────────────────────┘
```

### 6.2 Data flow: browsing a repo

1. User enters `atproto.com`, clicks **Describe**.
2. `RepoBrowser` GETs `/api/repo/describe?repo=atproto.com`.
3. `handleRepoDescribe` calls `repos.Describe(ctx, "atproto.com", nil)`.
4. `Browser` resolves the handle to a DID + PDS, creates an unauthenticated
   `APIClient`, calls `RepoDescribeRepo`, returns `{did, handle, collections}`.
5. The UI lists the collections.
6. User clicks `app.bsky.feed.post`; the UI GETs
   `/api/repo/records?repo=atproto.com&collection=app.bsky.feed.post`.
7. `Browser.ListRecords` calls `RepoListRecords`; returns 50 summaries
   (uri/cid/rkey) + a cursor.
8. User clicks a record; the UI GETs `/api/repo/record?...&rkey=...`.
9. `Browser.GetRecord` calls `RepoGetRecord`; returns the decoded value as
   JSON, which the UI renders in a `<pre>`.

### 6.3 Auth vs public reads

`repoAuthedClient` (in `pkg/server/server.go`) checks whether the requested
repo matches the logged-in account's DID. If it does, it returns the OAuth
session's DPoP-bound `APIClient`; otherwise it returns `nil`, and `Browser`
falls back to an unauthenticated PDS client. This means the user browses their
own repo with their token (respecting any read scope) and any other repo
anonymously, with no code change in the UI.

## 7. Backend Design (Go)

### 7.1 `pkg/repobrowser/browser.go` — the Browser

```go
type Browser struct {
    dir    identity.Directory
    client *http.Client
    logger *slog.Logger
}

func NewBrowser(logger *slog.Logger) *Browser {
    return &Browser{dir: identity.DefaultDirectory(), client: &http.Client{}, ...}
}

// pdsClient resolves identifier -> PDS, returns an unauthenticated APIClient.
// If an authenticated LexClient is passed (the OAuth session), it is used as-is.
func (b *Browser) pdsClient(ctx, identifier string, authed util.LexClient) (util.LexClient, string, error) {
    if authed != nil { return authed, "", nil }
    atid, _ := syntax.ParseAtIdentifier(identifier)
    ident, err := b.dir.Lookup(ctx, atid)
    if err != nil { return nil, "", err }
    return atclient.NewAPIClient(ident.PDSEndpoint()), ident.DID.String(), nil
}

func (b *Browser) Describe(ctx, identifier string, authed util.LexClient) (*RepoDescription, error) {
    c, _, err := b.pdsClient(ctx, identifier, authed)
    out, err := comatproto.RepoDescribeRepo(ctx, c, identifier)
    return &RepoDescription{Did: out.Did, Handle: out.Handle,
        HandleIsCorrect: out.HandleIsCorrect, Collections: out.Collections}, nil
}
```

`ListRecords` and `GetRecord` follow the same shape: resolve the PDS, call the
XRPC, trim to a UI-friendly struct. `ListRecords` returns `RecordSummary`
(uri/cid/rkey) — not the full value — so list pages are cheap. `rkey` is
extracted from the URI by manual path splitting (not `net/url`).

### 7.2 `pkg/server/server.go` — the routes

```go
mux.HandleFunc("GET /api/repo/describe", s.handleRepoDescribe)
mux.HandleFunc("GET /api/repo/records",   s.handleRepoRecords)
mux.HandleFunc("GET /api/repo/record",     s.handleRepoRecord)
```

Each handler reads query params, calls the corresponding `Browser` method, and
returns JSON. `repoAuthedClient` is the auth bridge:

```go
func (s *Server) repoAuthedClient(r *http.Request, repo string) lexutil.LexClient {
    api, err := s.oauth.ResumeClient(r)
    if err != nil { return nil }
    if api.AccountDID != nil && api.AccountDID.String() == repo {
        return api
    }
    return nil
}
```

## 8. Frontend Design (React)

### 8.1 `RepoBrowser.tsx` — three columns

The component is a three-column layout driven by local `useState`:

| Column | State | Action |
|---|---|---|
| Collections | `desc.collections` | click → load records |
| Records | `records[]` + `cursor` | click → load detail; "load more" → next page |
| Detail | `detail.value` | rendered as `<pre>` JSON |

The state transitions are: describe → (clears) → select collection →
(clears detail) → select record → (loads detail). Pagination appends to
`records` when a cursor is passed; a new collection resets.

### 8.2 Tab switch

`App.tsx` adds a two-tab nav: **Firehose** (the existing feed + account) and
**Repository** (the browser). The tab is local UI state; both pages share the
Redux store (the firehose keeps streaming while the user browses).

### 8.3 "Use mine"

When the user is logged in (`session.did`), the browser offers a "use mine"
button that fills the identifier with the user's DID, so they can browse their
own repo with one click.

## 9. Decision Records

### Decision: R1 — Public unauthenticated reads, not OAuth-only

- **Context:** Repo XRPCs are public. Requiring OAuth would block browsing
  other accounts.
- **Options:** (a) OAuth-only; (b) public reads, OAuth for own repo.
- **Decision:** (b). `repoAuthedClient` returns the OAuth client only when the
  repo == logged-in DID; otherwise nil → unauthenticated PDS client.
- **Rationale:** Maximizes the browser's usefulness; reads are public by
  protocol design.
- **Consequences:** The browser can read any public repo. Browsing the user's
  own repo uses their token (and any read scope it grants).
- **Status:** accepted

### Decision: R2 — List records as summaries, fetch value on demand

- **Context:** `listRecords` returns the full `value` per record, which is
  wasteful for a list view.
- **Options:** (a) return full values in the list; (b) return uri/cid/rkey,
  fetch value on click.
- **Decision:** (b). `ListRecords` returns `RecordSummary`; `GetRecord` fetches
  the value.
- **Rationale:** List pages stay small; the UI shows the rkey first, which is
  what the user scans.
- **Consequences:** Two round trips per record inspection. Acceptable for a
  browser.
- **Status:** accepted

### Decision: R3 — Manual AT URI parsing, not `net/url`

- **Context:** `rkeyFromURI` needs the last path segment of an `at://` URI.
- **Options:** (a) `net/url`; (b) manual `strings.Split`.
- **Decision:** (b).
- **Rationale:** The at-uri spec states Go's `net/url` does not work for AT
  URIs (colons in DIDs). Manual splitting is correct and trivial.
- **Consequences:** The helper is small and spec-anchored; no `net/url` quirk.
- **Status:** accepted

## 10. Implementation Plan (Phased)

### Phase 1 — Browser backend (DONE)

- `pkg/repobrowser/browser.go`: Describe, ListRecords, GetRecord, PDS
  resolution, rkey extraction.
- Verified: describe atproto.com → 25 collections; list → 50 records; get →
  decoded JSON.

### Phase 2 — HTTP routes (DONE)

- `pkg/server`: `/api/repo/{describe,records,record}` + `repoAuthedClient`.

### Phase 3 — Frontend (DONE)

- `RepoBrowser.tsx` three-column UI; `App.tsx` tab switch; CSS.
- Verified in Playwright: collections → records → detail, 0 errors.

### Phase 4 — Polish

- Show the repo's `rev` / commit root in the description (requires
  `com.atproto.sync.getLatestCommit` or `getHead`).
- Render record values with type-aware formatting (e.g. show `text` for posts,
  `subject` for likes) instead of raw JSON.
- Add a "open on bsky.app" link per record.
- Handle large collections with virtualized scrolling.

### Phase 5 — Integrity

- Fetch the repo's commit object and verify the MST root against `listRecords`
  output (requires CAR export via `com.atproto.sync.getRepo`).
- Show the commit signature status.

## 11. Test Strategy

- **Unit (Go):** `Browser.Describe/ListRecords/GetRecord` against a known repo
  (e.g. `atproto.com`), asserting the collections list contains
  `app.bsky.feed.post` and a known rkey resolves. Mock the PDS with a test
  server returning canned XRPC JSON.
- **Unit (frontend):** `RepoBrowser` state transitions: describe → select
  collection → select record → detail rendered.
- **Integration:** start `serve`, `curl /api/repo/describe?repo=atproto.com`,
  assert non-empty `collections`; `curl /api/repo/records?...`, assert
  `records` non-empty with non-empty `rkey`.
- **Manual:** browse `atproto.com`, click through a post, confirm the JSON
  matches the bsky.app view of that post.

## 12. Risks, Open Questions, Gotchas

### 12.1 Risks

- **Large repos:** a repo can have millions of records; pagination is required
  (already implemented via cursor). A future virtualized list avoids rendering
  thousands of rows.
- **Rate limits:** unauthenticated reads are rate-limited by the PDS. The
  browser should add a small client-side debounce and handle 429s.
- **Identity drift:** a handle may stop resolving. The UI should show
  `handleIsCorrect: false` prominently.

### 12.2 Gotchas

- **`net/url` breaks on AT URIs.** Use manual path splitting for `rkey`
  extraction. Documented in the at-uri spec.
- **`listRecords` returns newest-first by default.** Use `reverse=true` for
  chronological (oldest-first). The browser uses default (newest-first).
- **`getRecord` `cid` is optional** and selects a version; omit it for the
  current version.
- **`Value` is `*lexutil.LexiconTypeDecoder`.** Marshal it to JSON to get the
  record fields; do not assume a typed struct unless you decode against a
  Lexicon.

### 12.3 Open questions

- Should the browser show deleted records? `listRecords` only returns live
  records; the firehose is the only way to see deletions.
- Should the browser fetch the full CAR via `com.atproto.sync.getRepo` for an
  MST tree view? (Phase 5.)
- Should the browser support browsing by collection across the network
  (`com.atproto.sync.listReposByCollection`), not just one repo?

## 13. References

### 13.1 Specs (in `sources/specs/`)

- `repository.md` — MST, commit objects, paths, CAR.
- `sync.md` — `listReposByCollection`, `getRepo`, `getLatestCommit`.
- `at-uri-scheme.md` — AT URI syntax; note on `net/url`.
- `nsid.md`, `record-key.md`, `tid.md` — identifiers.

### 13.2 indigo APIs

- `api/atproto/repodescribeRepo.go` — `RepoDescribeRepo`.
- `api/atproto/repolistRecords.go` — `RepoListRecords`.
- `api/atproto/repogetRecord.go` — `RepoGetRecord`.
- `atproto/identity` — `DefaultDirectory`, `Lookup`, `PDSEndpoint`.
- `atproto/atclient` — `NewAPIClient`.

### 13.3 This repo

- `pkg/repobrowser/browser.go` — the browser.
- `pkg/server/server.go` — routes + `repoAuthedClient`.
- `frontend/src/RepoBrowser.tsx` — the UI.
- `frontend/src/App.tsx` — tab switch.

## 14. Project working rule

> [!important]
> List records as summaries (uri/cid/rkey); fetch the full value on demand.
> Returning full record values in every list page wastes bandwidth and makes
> large collections slow.
