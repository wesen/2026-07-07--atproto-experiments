---
Title: Investigation Diary
Ticket: PLUGIN-SHARING
Status: active
Topics:
    - atproto
    - lexicon
    - plugins
    - backend
    - firehose
    - oauth
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: /home/manuel/code/wesen/2026-07-07--atproto-experiments/pkg/firehose/consumer.go
      Note: Firehose decode extension (Step 1 study)
    - Path: /home/manuel/code/wesen/2026-07-07--atproto-experiments/pkg/oauth/factory.go
      Note: OAuth scope to add (Step 1 study)
    - Path: /home/manuel/code/wesen/2026-07-07--atproto-experiments/pkg/repobrowser/browser.go
      Note: Raw-JSON list/get reuse (Step 1 study)
    - Path: repo://pkg/bsky/client.go
      Note: Raw LexDo publish pattern reference
ExternalSources: []
Summary: |
    Chronological investigation diary for PLUGIN-SHARING: studying the existing atproto-experiments codebase and the browser-js-inject-vm project to design the publishing and feed side of social JS plugin sharing.
LastUpdated: 2026-07-07T00:00:00Z
WhatFor: Record the design investigation for PLUGIN-SHARING.
WhenToUse: Read before resuming work on PLUGIN-SHARING.
---





# Investigation Diary

## Goal

Capture the study and design of the publishing/feed side of social JS plugin
sharing: a custom Lexicon, an OAuth publish path, a firehose-driven plugin
feed, and local server endpoints.

## Step 1: Study existing systems and design the Lexicon + publish/feed paths

Studied the atproto-experiments codebase and the browser-js-inject-vm project
to ground the design in real file references, then wrote the design guide.

### Prompt Context

**User prompt (verbatim):** "look at ../2026-07-07--browser-js-inject-vm and [the Obsidian report]. I want to do two things: support social JS plugin sharing [and] run these JS plugins in our JS app ... Make a new docmgr ticket for each of the two parts of the task, and for each: Create a detailed analysis / design / implementation guide ... Store in the ticket and then upload to remarkable."

**Assistant interpretation:** Create two docmgr tickets (PLUGIN-SHARING for publish/feed, PLUGIN-RUNTIME for browser execution), write intern-ready design guides grounded in the existing code, and upload to reMarkable.

**Inferred user intent:** A design blueprint connecting the ATProto publishing work with the browser plugin VM, so an intern can implement social plugin sharing end-to-end.

### What I did
- Read the Obsidian deep-dive report on browser-js-inject-vm (the plugin VM, feed middleware, security model).
- Read browser-js-inject-vm source: `manifest.ts` (PluginManifestEntry + ?raw imports), `feed-keyword-lens.vm.js` (bundle shape), `contracts.ts` (RuntimeBundleMeta, hook contracts), `runtimeService.ts` (`loadRuntimeBundle` load seam), the README (the explicit "no network loading" limitation).
- Read atproto-experiments source: `firehose/consumer.go`, `repobrowser/browser.go` (raw-JSON decode fix), `oauth/factory.go` (DPoP + persistent store), `server/server.go` (ServeMux + ring buffer).
- Read ATProto specs: `lexicon.md`, `nsid.md`, `repository.md` to ground the Lexicon/NSID design.
- Designed the `dev.atproto-demo.plugin` Lexicon (record schema with inline source + optional blob).
- Designed the publish path (raw `LexDo` createRecord, reusing the REPO-BROWSER raw approach), the feed path (firehose decode + ring buffer), and the server endpoints.
- Wrote the 13-section design guide.

### Why
The design must be grounded in the real code so an intern can implement without rediscovering the raw-JSON decode lesson, the OAuth scope mechanism, or the load seam.

### What worked
- The browser VM's `loadRuntimeBundle(code: string)` seam made the split clean: PLUGIN-SHARING supplies bytes, PLUGIN-RUNTIME consumes them.
- The REPO-BROWSER raw-JSON pattern directly applies to both decoding plugin records from the firehose and publishing them via createRecord.

### What didn't work
- N/A (design-only step; no code run).

### What I learned
- indigo's typed wrappers reject custom `$type`s in BOTH directions (list/get AND createRecord). The raw `LexDo` + map[string]any approach is the universal pattern for custom Lexicons.
- NSID `dev.atproto-demo.plugin` is syntactically valid (hyphens allowed in domain authority segments).
- Feed summaries should exclude `source` (size); fetch on demand (mirrors repo browser's list/get split).

### What was tricky to build
- Choosing the storage model: inline `source` string vs blob. Decided on both fields in the Lexicon, inline path in v1, to keep `getRecord` one-shot while remaining forward-compatible.

### What warrants a second pair of eyes
- The publish body's `repo` field: the handler must substitute the OAuth `AccountDID` (the pseudocode uses a placeholder). Confirm the SDK client exposes its own DID.
- PDS behavior for unknown `$type`s: bsky.social accepts generically-typed records, but document the caveat that a PDS may validate/reject.

### What should be done in the future
- Implement the blob path (`sourceBlob`) for large plugins.
- Add `?action=delete` scope for plugin removal.
- A backfill via listRecords to cover firehose gaps.

### Code review instructions
- Read `design-doc/01-...md` §6 (backend) and §4 (Lexicon).
- Validate the NSID against `sources/specs/nsid.md`.
- Confirm `pkg/repobrowser/browser.go` `ListRecords`/`GetRecord` are reusable unchanged for the list/record endpoints.

### Technical details
- No code commit (design-only). Design guide: `design-doc/01-social-js-plugin-sharing-design-implementation-guide.md`.

## Step 2: Implement backend (Lexicon, publish, firehose decode, endpoints)

Implemented Phases 1–3 of the design: the `pkg/plugins` package, the OAuth
scope, the firehose plugin decode path, and the four server endpoints.

### Prompt Context

**User prompt (verbatim):** "GO ahead."

**Assistant interpretation:** Implement the PLUGIN-SHARING design (and then PLUGIN-RUNTIME), committing at appropriate intervals and keeping a detailed diary.

**Inferred user intent:** Turn the design guide into working code, end to end.

### What I did
- `pkg/plugins/lexicon.go`: `NSID = "dev.atproto-demo.plugin"`, plus `Hooks`, `Capabilities`, `PluginSummary` types.
- `pkg/plugins/publisher.go`: `PublishRecord`, `Publish()` via raw `LexDo` (Procedure, `application/json`, `com.atproto.repo.createRecord`), `DecodeSummary()` for firehose metadata.
- `pkg/oauth/factory.go`: added `repo:dev.atproto-demo.plugin?action=create` scope.
- `pkg/firehose/consumer.go`: `SubscribePlugins()` + `pluginSubs` + `broadcastPlugin`; refactored `handleCommit` into a `switch` on collection with `decodePost`/`decodePlugin` (raw `map[string]any`, not the typed `LexiconTypeDecoder`).
- `pkg/server/server.go`: `pluginRing`/`pluginCap` + `pumpPlugins` (handles delete by URI); 4 routes (`POST /api/plugins/publish`, `GET /api/plugins/feed`, `GET /api/plugins/list`, `GET /api/plugins/record`).

### Why
The design is grounded in the real code; implementation followed the guide's phased plan. The raw-`LexDo` approach (from REPO-BROWSER) applies to both publishing and decoding custom Lexicons.

### What worked
- `go build ./...` + `go vet` clean.
- Smoke test: `GET /api/plugins/feed` → `{"plugins":[]}`; `GET /api/plugins/list?repo=go-go-golems.bsky.social` → `{"records":[]}` with NO `unrecognized lexicon type` error (raw-JSON path works); `POST /api/plugins/publish` w/o auth → 401; firehose connected (lastSeq advancing).

### What didn't work
- First build failed: `handleCommit`'s `rkey` is a `syntax.RecordKey`, not `syntax.TID` (my decode fn signatures declared `syntax.TID`). Fixed with `sed` to `syntax.RecordKey`.

### What I learned
- `syntax.ParseRepoPath` returns `(NSID, RecordKey, error)`, not a TID. The record key type is `RecordKey`; `.String()` works on it.
- The firehose consumer's collection filter was a single `if != app.bsky.feed.post { continue }`; turning it into a `switch` cleanly separates the post and plugin decode paths.

### What was tricky to build
- Keeping the post path unchanged while adding the plugin path: extracted `decodePost` and `decodePlugin` so `handleCommit` stays a thin dispatcher. Deletes carry no record bytes, so `decodePlugin` broadcasts a minimal summary (URI + action=delete) for the ring to evict by URI.

### What warrants a second pair of eyes
- `Publish()` builds the record body with the account DID substituted by the handler (the handler passes `api.AccountDID.String()` as `did`). Confirm the OAuth scope `repo:dev.atproto-demo.plugin?action=create` is honored by bsky.social's PDS.
- `pumpPlugins` evicts deletes by URI match; confirm a plugin re-published under a new rkey (different URI) doesn't leave a stale entry.

### What should be done in the future
- Real OAuth publish round-trip (needs human consent) to confirm createRecord on the custom Lexicon succeeds against bsky.social.
- WebSocket fan-out for the plugin feed (v1 polls).
- Blob path (`sourceBlob`) for large plugins.

### Code review instructions
- `go build ./... && go vet ./...`.
- `curl /api/plugins/feed` and `curl '/api/plugins/list?repo=go-go-golems.bsky.social'`.
- Read `pkg/plugins/publisher.go` `Publish()` and `pkg/firehose/consumer.go` `decodePlugin`.

### Technical details
- Commit `e4eb5a3` (backend: Lexicon, publish, firehose decode, endpoints).

## Step 3: Implement frontend (Publish tab)

Implemented Phase 4: the compose/publish UI.

### Prompt Context
**User prompt (verbatim):** (see Step 2)

### What I did
- `frontend/src/api.ts`: `publishPlugin`, `pluginFeed`, `listPlugins`, `getPlugin` + `PluginSummary`/`PublishPluginInput` types.
- `frontend/src/PublishPlugin.tsx`: auth-gated compose form (title, description, source textarea with a valid `defineRuntimeBundle` starter skeleton, packages, version, license, feed-middleware toggle). Shows the published URI on success.
- `frontend/src/App.tsx`: third "Publish" tab.
- CSS for the publish form.

### What worked
- `pnpm build` clean (180 KB JS, 59 KB gzip).
- Embedded bundle contains `Publish plugin`, `dev.atproto-demo.plugin`, `publishPlugin`.

### What didn't work
- Playwright MCP lost its browser connection when I cleared a stale SingletonLock (had to `pkill chrome`); could not re-verify the UI in-browser. Fell back to curl-verified bundle contents.

### What I learned
- The Playwright MCP profile lock (`SingletonLock`) survives a killed browser; clearing it requires removing the file after killing the process, but the MCP server then reports "Not connected" and won't auto-reconnect within a session.

### What was tricky to build
- N/A (straightforward React form).

### What warrants a second pair of eyes
- The starter source's `bump` handler dispatches `plugin/state.merge { count: 1 }` — that's wrong (should add, not set 1). Fix the starter to read current count: `dispatchPluginAction('state.merge', { count: ((state.plugin&&state.plugin.count)||0)+1 })`. Non-blocking (it's a template the user edits), but should be correct.

### What should be done in the future
- Syntax-highlighting source editor (reuse browser-js-inject-vm's SourceViewer tokenizer).
- In-browser preview of the plugin before publishing.

### Code review instructions
- `cd frontend && pnpm build`.
- `grep -o 'Publish plugin' <served JS>`.

### Technical details
- Commit `10f28c6` (frontend: Publish tab + plugin API client).
