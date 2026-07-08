---
Title: Investigation Diary
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
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: /home/manuel/code/wesen/2026-07-07--atproto-experiments/frontend/src/RepoBrowser.tsx
      Note: 3-column UI (Step 1)
    - Path: /home/manuel/code/wesen/2026-07-07--atproto-experiments/pkg/repobrowser/browser.go
      Note: Custom-Lexicon raw-JSON decode fix (Step 2)
    - Path: /home/manuel/code/wesen/2026-07-07--atproto-experiments/pkg/server/server.go
      Note: /api/repo/* routes (Step 1)
ExternalSources:
    - https://atproto.com/specs/repository
    - https://atproto.com/specs/at-uri-scheme
Summary: |
    Chronological investigation diary for the ATProto repository browser: design, backend, frontend, the custom-Lexicon decode bug, and verification against the user's own repo.
LastUpdated: 2026-07-07T00:00:00Z
WhatFor: Record how the repository browser was built and the decode bug fixed.
WhenToUse: Read before resuming work on REPO-BROWSER.
---




# Investigation Diary

## Goal

Capture the step-by-step journey of building the repository browser page: a
second page in the ATProto demo that walks any public repository by handle/DID,
lists collections, paginates records, and renders a record's decoded value.

## Step 1: Backend browser package + HTTP routes + frontend

Built the three-layer repository browser: a Go `repobrowser` package over the
indigo `com.atproto.repo.*` XRPCs, HTTP routes, and a React three-column UI.

### Prompt Context

**User prompt (verbatim):** "Let's build a second page that allows me to walk through my repository and look at all the objects and stuff. a repository browser, basically. Create a new docmgr ticket and Create a detailed analysis / design / implementation guide..."

**Assistant interpretation:** Build a repository browser page (describe repo, list collections, paginate records, show record detail), create a docmgr ticket, and write an intern design guide.

**Inferred user intent:** A learning tool to inspect any ATProto repository's contents, complementing the firehose (live writes) with read access (static contents).

### What I did
- Created ticket `REPO-BROWSER` with design-doc + diary.
- Researched the indigo XRPC read APIs: `RepoDescribeRepo` (collections, did, handle), `RepoListRecords` (paginated uri/cid/value), `RepoGetRecord` (single value). Saved the type definitions.
- `pkg/repobrowser/browser.go`: `Browser` resolving handle/DID → PDS via `identity.DefaultDirectory()`, unauthenticated `atclient.NewAPIClient(host)` for public reads (OAuth client passed when repo == logged-in DID). `Describe`, `ListRecords`, `GetRecord`.
- `pkg/server/server.go`: `/api/repo/{describe,records,record}` routes + `repoAuthedClient` (OAuth session iff repo == own DID).
- `frontend/src/RepoBrowser.tsx`: 3-column UI (collections → records → detail JSON), pagination, "use mine" shortcut. `App.tsx` tab switch (Firehose / Repository). CSS.
- Verified via curl + Playwright against `atproto.com`: 25 collections, 50 records in `app.bsky.feed.post`, record detail with `$type`/`text`/`embed`. 0 console errors.

### Why
Reads are the complement to the firehose's writes; a repo browser makes the repository data model tangible (collections, rkeys, CIDs, record values).

### What worked
- All three XRPCs worked first try against the live PDS.
- `repoAuthedClient` cleanly bridges public vs own-repo reads.
- The 3-column UI mapped directly onto the describe/list/get flow.

### What didn't work
- `rkeyFromURI` using `net/url` returned empty rkeys. Go's `net/url` cannot parse `at://` URIs (colons in DIDs confuse host:port splitting); the at-uri spec explicitly notes this. Fixed by manual `strings.SplitN(rest, "/", 3)`.

### What I learned
- `com.atproto.repo.*` reads are public and unauthenticated; identity resolution (handle→DID→PDS) is the only hop needed.
- AT URIs must be parsed manually in Go; `net/url` is documented as non-functional for them.

### What was tricky to build
- The `net/url` AT-URI parsing failure was silent (empty rkey, not an error); caught only by inspecting the JSON response.

### What warrants a second pair of eyes
- `repoAuthedClient`: confirm `api.AccountDID` is non-nil before `.String()` (it is after ResumeSession, but a nil guard matters).

### What should be done in the future
- Show `rev`/commit root in the description (Phase 4).
- Type-aware record rendering (show `text` for posts, not raw JSON).

### Code review instructions
- `go build ./...` + `pnpm build` clean.
- `curl /api/repo/describe?repo=atproto.com` → collections includes `app.bsky.feed.post`.

### Technical details
- Commit: `597df58`.

## Step 2: Custom-Lexicon decode bug (dev.hypercard.app.card)

The user pointed the browser at their own handle `go-go-golems.bsky.social`,
which contains custom `dev.hypercard.app.*` collections. `listRecords` failed
with `unrecognized lexicon type: "dev.hypercard.app.card"`. I fixed it by
bypassing indigo's typed decoder.

### Prompt Context

**User prompt (verbatim):** "my handle is go-go-golems.bsky.social"

**Assistant interpretation:** Browse the user's actual repo to verify the browser works on real, non-trivial data.

**Inferred user intent:** Confirm the browser handles the user's repo, including any custom collections.

### What I did
- Described `go-go-golems.bsky.social`: `did:plc:y7opujl2vvsf4v2n5dm54tny`, 4 collections (`app.bsky.feed.post`, `app.bsky.graph.follow`, `dev.hypercard.app.card`, `dev.hypercard.app.stack`).
- Clicked `dev.hypercard.app.card` → records column empty. curl showed `error: listRecords: failed decoding JSON response body: unrecognized lexicon type: "dev.hypercard.app.card"`.
- Root-caused: indigo's `RepoListRecords_Record.Value` is `*lexutil.LexiconTypeDecoder`; its `UnmarshalJSON` calls `JsonDecodeValue`, which returns `ErrUnrecognizedType` for any `$type` not registered via `lexutil.RegisterType`. indigo only registers `app.bsky.*`/`com.atproto.*`, so custom Lexicons fail.
- Fixed `ListRecords` and `GetRecord` to call `LexDo` directly with a raw JSON output struct using `json.RawMessage` for the value, bypassing the typed decoder entirely. Now any collection decodes.
- Verified: `dev.hypercard.app.card` → 4 records; detail shows `name`, `$type`, `stack` (AT URI link), `script`, `ordinal`, `initialState`. First card: "Executable JS FRP stack".

### Why
A repository browser must handle ANY collection, including custom Lexicons the SDK doesn't know about. Failing on unknown types defeats the purpose of browsing arbitrary repos.

### What worked
- The raw-JSON `LexDo` approach decodes every collection; `RepoDescribeRepo` (which has no `Value`) still uses the typed path.
- Playwright confirmed the custom card record renders with `name`/`script`/`$type=dev.hypercard.app.card`.

### What didn't work
- The typed `RepoListRecords`/`RepoGetRecord` indigo wrappers are unusable for arbitrary repos because of the registered-type requirement.

### What I learned
- `lexutil.JsonDecodeValue` returns `ErrUnrecognizedType` for unregistered `$type`s — a hard error, not a fallback to generic map.
- The robust pattern for "browse arbitrary ATProto data" is raw JSON via `LexDo`, not the generated typed wrappers.
- `dev.hypercard.app.*` is a real custom-Lexicon app (Hypercard) with cards referencing stacks via AT URIs — a good test case for the browser.

### What was tricky to build
- Recognizing that the empty records column was a decode error, not an empty collection; the error only surfaced via curl, not in the UI (the UI swallowed the error into the `error` state but the column just looked empty).

### What warrants a second pair of eyes
- The raw JSON path skips Lexicon validation entirely. For a read-only browser that's correct; for anything that re-serializes or acts on records, validate against the Lexicon.

### What should be done in the future
- Surface PDS errors in the UI more prominently (a toast/banner) so an empty column is distinguishable from an error.
- Consider resolving the `stack` AT URI in card records into a clickable link (Phase 4 type-aware rendering).

### Code review instructions
- `curl /api/repo/records?repo=go-go-golems.bsky.social&collection=dev.hypercard.app.card` → 4 records.
- `curl /api/repo/record?...&rkey=<first>` → JSON with `$type: dev.hypercard.app.card`.

### Technical details
- Commit: `a07b130`.
- Fix: `listRecordsRaw`/`getRecordRaw` structs with `json.RawMessage` value; `c.LexDo(ctx, util.Query, "", "com.atproto.repo.{listRecords,getRecord}", params, nil, &raw)`.
