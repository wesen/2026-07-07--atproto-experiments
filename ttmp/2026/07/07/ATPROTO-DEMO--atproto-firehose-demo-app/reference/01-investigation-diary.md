---
Title: Investigation Diary
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
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: /home/manuel/code/wesen/2026-07-07--atproto-experiments/cmd/atproto-demo/main.go
      Note: glazed/cobra CLI entry; built in Step 3
    - Path: /home/manuel/code/wesen/2026-07-07--atproto-experiments/embed.go
      Note: go:embed of frontend/dist; built in Step 3
    - Path: /home/manuel/code/wesen/2026-07-07--atproto-experiments/frontend/src/store.ts
      Note: |-
        Built in Step 4
        Fixed deletes piling at top (Step 8)
    - Path: /home/manuel/code/wesen/2026-07-07--atproto-experiments/pkg/bsky/client.go
      Note: Account client; built in Step 3
    - Path: /home/manuel/code/wesen/2026-07-07--atproto-experiments/pkg/firehose/consumer.go
      Note: Built in Step 3; verified in Step 5
    - Path: /home/manuel/code/wesen/2026-07-07--atproto-experiments/pkg/server/server.go
      Note: HTTP server; built in Step 3
    - Path: repo://pkg/oauth/factory.go
      Note: OAuth DPoP factory (Step 8)
    - Path: repo://ttmp/2026/07/07/ATPROTO-DEMO--atproto-firehose-demo-app/scripts/03-oauth-dpop-integration-sketch.go
      Note: OAuth DPoP integration sketch (Phase 5 follow-up)
ExternalSources:
    - https://atproto.com/specs/sync
    - https://github.com/bluesky-social/indigo
Summary: |
    Chronological investigation diary for the ATProto firehose demo: spec download, study, Go+glazed backend, React/Vite/Redux frontend, end-to-end verification, and the design/implementation guide.
LastUpdated: 2026-07-07T00:00:00Z
WhatFor: Record how the demo was built, what failed, and how to continue.
WhenToUse: Read before resuming work on ATPROTO-DEMO.
---










# Investigation Diary

## Goal

Capture the step-by-step journey of building the ATProto firehose demo: studying
the protocol specs, building a Go+glazed backend that subscribes to the firehose
and decodes Bluesky posts, building a React/Vite/Redux frontend, verifying it
end-to-end against the live network, and writing the intern-facing design guide.

## Step 1: Ticket setup and spec discovery

We created the docmgr ticket `ATPROTO-DEMO` and discovered the full set of
ATProto specifications and guides by scraping the link graph of `atproto.com`.
This established the source material for the whole investigation.

### Prompt Context

**User prompt (verbatim):** "Create a new docmgr ticket to create a demo app for learning atproto. First, download the atproto specs using defuddle and store it in the sources/ directory, and then work in go (use the glazed framework) and html / js with react and vite and redux, ... I want to study how to build an app that subscribes to the firehose and allows me to do interesting things with bsky posts and my bsky account too. Create a detailed analysis / design / implementation guide that is for a new intern ... Store in the ticket and then upload to remarkable. As you work, commit at appropriate intervals, and keep a detailed diary as you go."

**Assistant interpretation:** Bootstrap a docmgr ticket, download the ATProto specs into `sources/`, then build a Go (glazed) + React/Vite/Redux demo that subscribes to the firehose and acts on the user's bsky account, and write an intern-facing design guide, committing and diary-ing throughout.

**Inferred user intent:** Learn ATProto deeply by building a real, working app, and produce a durable, teachable artifact (design doc + reMarkable upload) that onboards a new engineer.

### What I did
- Confirmed tools: `defuddle` 0.18.1, `remarquee`, `glaze`, Go 1.25.5, `pnpm`, `node` all present.
- Created ticket: `docmgr ticket create-ticket --ticket ATPROTO-DEMO --title "ATProto Firehose Demo App" --topics atproto,firehose,backend,frontend,websocket`.
- Added design-doc + diary docs.
- Scraped `atproto.com` link graph: found 19 specs (`/specs/*`) and 17 guides (`/guides/*`).

### Why
The whole investigation must be evidence-based; having the specs locally (via defuddle) lets every later claim be anchored to a file.

### What worked
- `curl -sL https://atproto.com/specs | grep -oE 'href="[^"]*"'` revealed the complete spec list.
- defuddle + `fold -w 100 -s` produced clean, wrapped markdown for every spec.

### What didn't work
- `atproto.com/sitemap.xml` returned empty (no sitemap); had to scrape HTML links instead.
- `docs.bsky.app` pages returned 0 bytes from defuddle (JS-rendered); relied on `atproto.com` mirrors and the indigo source instead.

### What I learned
- The official spec surface is small and well-organized: ~19 specs cover the entire protocol.
- `atproto.com/guides/streaming-data.md` is the single best entry point and explicitly names indigo as the most complete firehose SDK.

### What was tricky to build
- Nothing yet; this was discovery.

### What warrants a second pair of eyes
- Whether the chosen spec subset (19 specs) is complete enough for the design doc's claims.

### What should be done in the future
- Capture `docs.bsky.app` app.bsky lexicon pages via a JS-capable fetcher if deeper record-schema detail is needed.

### Code review instructions
- Start at `sources/specs/` and `sources/guides/`; verify the file list matches `atproto.com/specs` and `/guides`.

### Technical details
- Spec download loop: `for s in $SPECS; do defuddle parse "https://atproto.com/specs/$s" --md | fold -w 100 -s > "specs/$s.md"; done`.

## Step 2: Deep study of the firehose wire protocol and indigo SDK

I read the sync, event-stream, repository, and data-model specs in full, then
fetched the actual indigo source files (`events.go`, `consumer.go`,
`syncrepos.go`, `feedpost.go`, `tap-firehose.go`) to ground the design in real
API signatures rather than assumptions.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Study the specs and the reference Go implementation to understand exactly how the firehose works before writing any code or design.

**Inferred user intent:** Avoid speculative design; anchor every architectural claim to a spec section or a source line.

### What I did
- Read `sources/specs/sync.md` (event types, validation checklist, record-level sync pattern).
- Read `sources/specs/event-stream.md` (CBOR framing, `op`/`t` header, sequence resumption).
- Read `sources/specs/repository.md` (MST, commit objects, CAR slices, operation inversion).
- Read `sources/specs/data-model.md` (DRISL-CBOR, blessed CID format).
- Fetched indigo source: `events.go` (`XRPCStreamEvent`, `HandleRepoStream`), `consumer.go` (`RepoStreamCallbacks`), `syncrepos.go` (`SyncSubscribeRepos_Commit`), `feedpost.go` (`FeedPost`), `tap-firehose.go` (canonical connection loop).

### Why
The firehose is binary CBOR/CAR, not JSON — the most error-prone part of atproto. Getting the API signatures right up front prevents compile-time churn later.

### What worked
- The GitHub raw + trees API gave exact package layouts and type definitions.
- `tap-firehose.go` is a complete, production-grade reference for the connection loop, cursor resumption, and commit processing.

### What didn't work
- `atdata.UnmarshalCBOR` returns `map[string]any`, not a typed node with `RawValue()` as I first assumed. Caught this by reading `atproto/atdata/data.go` before coding.

### What I learned
- `#commit` names the account field `repo`, not `did` (unique among event types) — a classic gotcha.
- `prevData` (previous MST root) is "effectively required for the inductive firehose" but may be null on older relays.
- indigo's `parallel.NewScheduler(workers, queue, ident, handler)` preserves per-repo ordering while fanning out.
- Record decode path: `repo.VerifyCommitMessage` → `r.GetRecordBytes(collection, rkey)` → `atdata.UnmarshalCBOR(recBytes)`.

### What was tricky to build
- Reconciling the docs' `RepoStreamCallbacks`/`HandleRepoStream` (referenced in the bsky firehose guide) with their actual location: they live in `events/consumer.go`, not `events/events.go`. Found by grepping the package file list.

### What warrants a second pair of eyes
- The claim that the demo "trusts the relay" for signature verification — confirm `repo.VerifyCommitMessage` does structural but not signature verification (it does; signature verification needs `VerifyCommitSignature` + an identity directory).

### What should be done in the future
- Add `repo.VerifyCommitSignature` + `identity.DefaultDirectory()` for full verification (Phase 5).

### Code review instructions
- Compare `sources/indigo-src/consumer.go` and `tap-firehose.go` against the design doc's Section 7 pseudocode.

### Technical details
- Connection URL rewrite: `https` → `wss`, path `/xrpc/com.atproto.sync.subscribeRepos`, query `?cursor=<seq>`.

## Step 3: Go backend skeleton (firehose consumer, bsky client, HTTP server)

I built the three backend packages and the glazed CLI entry point, iterating
against the compiler until `go build ./...` succeeded.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Implement the Go backend using glazed and indigo: a firehose consumer, an account client, and an HTTP server.

**Inferred user intent:** A real, compiling, runnable backend — not pseudocode — so the design doc references concrete files.

### What I did
- `pkg/firehose/consumer.go`: `Consumer` with `Run` (dial + cursor + backoff), `handleCommit` (verify → walk CAR → decode posts → broadcast), `Subscribe`/`broadcast` fan-out.
- `pkg/bsky/client.go`: `Login` (app password), `CreatePost`, `Like`, `Profile`.
- `pkg/server/server.go` + `ws.go`: `net/http.ServeMux` routes, ring buffer, WebSocket fan-out.
- `cmd/atproto-demo/main.go`: glazed/cobra `serve` + `firehose` subcommands.
- `embed.go`: `go:embed all:frontend/dist`.

### Why
A compiling skeleton makes the design doc's file references trustworthy and gives the intern a running starting point.

### What worked
- `go build ./...` succeeded after fixing three issues (below).
- End-to-end run decoded real posts within seconds.

### What didn't work
- **`sources/indigo-src/*.go` broke the build** — Go tried to compile the reference files (which declare `package events`/`package bsky`). Fixed by prepending `//go:build ignore` to each.
- **`go:embed all:frontend/dist` failed** — the directive was in `pkg/embed/` but `frontend/dist` is at the repo root, and `go:embed` cannot use `..`. Fixed by moving `embed.go` to the repo root.
- **glazed `--log-level` flag not defined** — `logging.InitLoggerFromCobra` reads `--log-level` but I forgot to call `logging.AddLoggingSectionToRootCommand(rootCmd, ...)` in `main()`. Fixed by adding the call.
- **`go mod tidy` pulled libp2p** — indigo's identity package transitively depends on libp2p; harmless but large.

### What I learned
- `LexiconTypeDecoder{Val: cbg.CBORMarshaler}` is how you wrap a typed record for `RepoCreateRecord_Input.Record`.
- `atclient.LoginWithPasswordHost(ctx, host, identifier, password, "", nil)` returns an authenticated `*APIClient` that implements `lexutil.LexClient`.
- Go 1.22+ `ServeMux` method+pattern routing (`"GET /api/posts"`) is sufficient; no third-party router needed.

### What was tricky to build
- The `go:embed` path restriction (no `..`) forced the embed file to the repo root, which is slightly unusual but standard.
- The glazed logging flag registration must happen in `main()` before `Execute()`, not just in `PersistentPreRunE`.

### What warrants a second pair of eyes
- `pkg/firehose/consumer.go` `handleCommit`: the non-blocking `broadcast` drops posts for slow subscribers silently — acceptable for a demo, but verify the drop rate isn't masking decode bugs.
- `pkg/bsky/client.go`: app password flows through the server in memory; confirm this is local-only.

### What should be done in the future
- Persist `lastSeq` to disk (Phase 5).
- Add `#identity`/`#account` handling (Phase 5).

### Code review instructions
- `go build ./...` must pass; `go vet ./...` clean.
- Run `./atproto-demo firehose --relay https://relay1.us-east.bsky.network` and confirm JSON post lines on stdout.

### Technical details
- Build: `go build -o /tmp/atproto-demo ./cmd/atproto-demo` (27 MB binary, includes libp2p).

## Step 4: React/Vite/Redux frontend

I scaffolded the frontend with Vite 6 + React 18 + Redux Toolkit, wired a
WebSocket hook to the Redux store, and built the live feed + account UI.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Build the frontend with React, Vite, and Redux that consumes the `/ws` and `/api` endpoints.

**Inferred user intent:** A working SPA that embeds into the Go binary and shows the live firehose plus a compose box.

### What I did
- `frontend/package.json`, `vite.config.ts` (proxy `/api`+`/ws` to :8080), `tsconfig.json`.
- `src/store.ts`: `feedSlice` (capped 500) + `sessionSlice`.
- `src/useFirehose.ts`: WebSocket with reconnect + backoff, seeds from `/api/posts`.
- `src/Feed.tsx`, `AccountPanel.tsx`, `App.tsx`, `main.tsx`, `index.css`.

### Why
The user explicitly asked for React + Vite + Redux; Redux Toolkit gives the cleanest slice pattern for a streaming feed.

### What worked
- `pnpm install` + `pnpm build` succeeded after one fix.
- The built `dist/` embedded cleanly into the Go binary.

### What didn't work
- **TS error in `AccountPanel.tsx`**: the imported `postError` action was shadowed by a `const postError = useSelector(...)`, making `postError(String(err))` try to call a `string`. Fixed by aliasing the import (`postError as postErrorAction`) and renaming the selector.

### What I learned
- Redux Toolkit's `createSlice` with `state.unshift` + `state.length = CAP` is a clean way to cap a ring buffer immutably.
- Vite's `server.proxy` with `ws: true` makes local dev (frontend :5173, backend :8080) seamless.

### What was tricky to build
- The action/selector name collision in `AccountPanel.tsx` — a classic Redux gotcha when an action and a selector share a name.

### What warrants a second pair of eyes
- `useFirehose.ts` reconnect logic: confirm the backoff caps at 30s and doesn't spin on a permanently-down server.

### What should be done in the future
- Wire the like button (Phase 4).
- Add profile display (Phase 4).

### Code review instructions
- `cd frontend && pnpm build` must pass with no TS errors.
- `pnpm dev` + `go run ./cmd/atproto-demo serve` should show live posts in the browser.

### Technical details
- Build output: `dist/assets/index-*.js` (~173 KB, 57 KB gzip).

## Step 5: End-to-end verification against the live network

I ran the full binary against the real Bluesky relay and confirmed every layer
works: SPA serving, firehose connection, CBOR/CAR decoding, and the `/api` +
`/ws` endpoints returning real data.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Prove the skeleton actually works end-to-end before writing the design doc.

**Inferred user intent:** The design doc must describe a working system, not a hypothetical one.

### What I did
- `go build -o /tmp/atproto-demo ./cmd/atproto-demo`.
- `/tmp/atproto-demo serve --addr :18081 --relay https://relay1.us-east.bsky.network &`.
- `curl http://localhost:18081/` → served the embedded SPA.
- `curl http://localhost:18081/api/status` → `{"lastSeq":31633231492,"loggedIn":false}`.
- `curl http://localhost:18081/api/posts` → real decoded posts, e.g. `{"did":"did:plc:rvf22xkomx6eydkcjxdkeijb","rkey":"3mq3r32dzws25","uri":"at://.../app.bsky.feed.post/...","text":"He called and immediately tried to guilt trip me lol","langs":["en"],"action":"create","seq":31633231144,...}`.
- **Browser verification with Playwright** (added after the user asked "did you test it with playwright or so?"): navigated to `http://localhost:18090/`, waited 5s, captured an accessibility snapshot. Confirmed the React app rendered the header, the "Live firehose" panel (`500 shown · seq 31633487813 · ~39/s` — proving the `/ws` WebSocket delivers live posts and the rate counter works), hundreds of real decoded posts with text/DID/relative-time/create-delete-action, and the "Sign in to your bsky account" app-password form. Console had **0 errors / 0 warnings**. Saved a viewport screenshot to `atproto-demo-live.jpeg`.

### Why
Verifying against the live network is the only way to confirm the CBOR/CAR decode path is correct — unit tests with fixtures can't catch relay-specific quirks like `prevData` nullability.

### What worked
- Real posts decoded with correct `text`, `langs`, `cid`, `uri`, `seq` within ~4 seconds of connecting.
- The `seq` advanced from 31633231492 to 31633231744, confirming live streaming + cursor tracking.

### What didn't work
- One log line `prevData was null; skipping tree root check` for some commits — expected on certain repos/relays; the consumer logs and continues (does not crash).

### What I learned
- The firehose is genuinely high-volume: dozens of posts decoded in a few seconds.
- `relay1.us-east.bsky.network` provides `prevData`; the bare `bsky.network` endpoint does not (matches the bsky firehose guide's note).
- The earlier `curl`-only verification proved the backend but **not** the browser. Playwright confirmed the full stack (embedded SPA → /ws WebSocket → Redux → React render) works with zero console errors. The lesson: always do a browser pass, not just API curls.

### What was tricky to build
- Nothing new; this was validation. The earlier `--log-level` fix was what made this run possible.

### What warrants a second pair of eyes
- Confirm the decoded `text` matches the actual bsky post (spot-check a `uri` against the bsky web UI).

### What should be done in the future
- Add an automated integration test that asserts `lastSeq` increases within 10s.

### Code review instructions
- Reproduce: build, run `serve`, `curl /api/posts`, confirm non-empty JSON with `text` fields.

### Technical details
- Relay: `wss://relay1.us-east.bsky.network/xrpc/com.atproto.sync.subscribeRepos`.
- Sample seq range observed: 31633231144 – 31633231744.

## Step 6: Design & implementation guide

I wrote the comprehensive, intern-facing design doc covering ATProto
architecture, the firehose wire protocol, the application architecture, decision
records, a phased implementation plan, and references — all anchored to the
downloaded specs and the repository's source files.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Write the detailed analysis/design/implementation guide for a new intern, with prose, bullets, pseudocode, diagrams, and API/file references.

**Inferred user intent:** A durable, teachable artifact that onboards a new engineer to both ATProto and this codebase.

### What I did
- Wrote `design-doc/01-atproto-firehose-demo-app-design-implementation-guide.md` (16 sections, ~43 KB).
- Included: executive summary, problem/scope, ATProto current-state analysis, firehose event model, wire protocol, repository/CAR/MST, indigo SDK reference, application architecture with ASCII diagrams, data-flow walkthroughs, backend/frontend design, 6 decision records, alternatives (Jetstream), 6-phase implementation plan, test strategy, risks/gotchas/open questions, and a full references section.

### Why
The user explicitly asked for an intern-facing guide with prose, pseudocode, diagrams, and API/file references — the ticket-research skill's writing-style guide prescribes exactly this structure.

### What worked
- Every major claim is anchored to a `sources/specs/*.md` file or a repository source file.
- The decision records (D1–D6) capture the non-obvious choices (raw firehose vs Jetstream, generic vs typed decode, app password vs OAuth, etc.).

### What didn't work
- Nothing; the doc was written in one pass after all grounding was complete.

### What I learned
- Writing the design doc *after* building and verifying the skeleton made the file references concrete and the pseudocode accurate (it matches the actual code).

### What was tricky to build
- Keeping the doc exhaustive yet navigable; the 16-section structure with decision records and a phased plan balances depth and scannability.

### What warrants a second pair of eyes
- The decision records' "Consequences" — confirm D1 (trust the relay) and D5 (in-memory) are acceptable for a learning tool.
- The phased plan's Phase 4–6 scope — confirm it matches the user's "interesting things with bsky posts and my bsky account" intent.

### What should be done in the future
- Add diagrams as images (not just ASCII) if the reMarkable render of ASCII diagrams is poor.

### Code review instructions
- Read `design-doc/01-...md` top to bottom; verify every `sources/...` and `pkg/...` reference resolves.

### Technical details
- Doc size: 42981 bytes, 16 sections, 6 decision records, 3 ASCII diagrams.

## Step 7: Docmgr bookkeeping, validation, and reMarkable upload

I completed the ticket bookkeeping (related files, changelog, tasks), validated
with `docmgr doctor`, and uploaded the design doc + diary bundle to reMarkable.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Finalize the ticket bookkeeping and upload the design doc + diary to reMarkable.

**Inferred user intent:** A durable, reviewable deliverable on the reMarkable.

### What I did
- Related 8 source files to the design doc and 6 to the diary (all with `--file-note` reasons).
- Added 10 tasks and checked all complete; updated the changelog with 4 entries.
- `docmgr doctor --ticket ATPROTO-DEMO --stale-after 30` → initially 1 warning (4 diary files missing notes), fixed by adding notes, reran → ✅ All checks passed.
- `remarquee status` → ok; `remarquee cloud account` → wesen@ruinwesen.com.
- Dry-run bundle upload of design doc + diary → confirmed layout/name/paths.
- Real bundle upload → `OK: uploaded ATProto Firehose Demo - Design & Implementation Guide.pdf -> /ai/2026/07/07/ATPROTO-DEMO`.
- Verified: `remarquee cloud ls /ai/2026/07/07/ATPROTO-DEMO --long` lists the PDF.

### Why
The ticket-research skill requires bookkeeping + validation + reMarkable delivery as the final handoff.

### What worked
- Doctor passed cleanly after adding the 4 missing file notes.
- Bundle upload succeeded on the first real attempt (dry-run caught nothing to fix).

### What didn't work
- Doctor initially flagged 4 diary-related files as missing notes — I had written them into the diary frontmatter without Notes. Fixed with `doc relate --file-note`.

### What I learned
- Always include a `Note:` for every `RelatedFiles` entry when hand-writing frontmatter; the doctor enforces it.
- The remarquee bundle produces a single PDF with a ToC from the markdown headings (`--toc-depth 2`).

### What was tricky to build
- The doctor's "missing_related_file_note" warning points at the doc path, not the file — had to infer which doc's RelatedFiles was incomplete.

### What warrants a second pair of eyes
- Confirm the reMarkable PDF renders the ASCII diagrams and code blocks legibly (pandoc → xelatex).

### What should be done in the future
- If ASCII diagrams render poorly, replace with rendered images (mermaid/graphviz) before re-uploading.

### Code review instructions
- `docmgr doctor --ticket ATPROTO-DEMO --stale-after 30` → ✅ All checks passed.
- `remarquee cloud ls /ai/2026/07/07/ATPROTO-DEMO --long --non-interactive` → lists the bundle PDF.

### Technical details
- reMarkable path: `/ai/2026/07/07/ATPROTO-DEMO/ATProto Firehose Demo - Design & Implementation Guide.pdf`.
- Bundle = design doc (43 KB, 16 sections) + diary (20 KB, 7 steps).

## Step 8: Replace app-password auth with OAuth DPoP; fix deletes piling at top

The user asked to log in through Bluesky via OAuth DPoP instead of an app
password, then asked whether the handle field is necessary. I implemented the
full OAuth DPoP flow (the production auth path from the original Decision D3),
made the handle optional, and separately fixed a feed bug where delete events
piled up at the top.

### Prompt Context

**User prompt (verbatim):** "can we do oauth dpop to log in through bluesky and not use an app password?"

**Assistant interpretation:** Implement ATProto OAuth (which mandates DPoP) to replace the app-password login, using the indigo `atproto/auth/oauth` SDK.

**Inferred user intent:** A production-grade, password-free login: the user consents on bsky.app, the demo gets a DPoP-bound access token, no password ever touches the demo server.

### What I did
- Researched: read `sources/specs/oauth.md` (DPoP mandatory for all clients, server-issued nonces, ES256/P-256, PAR, PKCE, dynamic client metadata via `client_id` URL).
- Saved indigo reference to ticket `scripts/`: `01-oauth-web-demo.go` (full reference web app), `02-oauth-sdk-*.go` (OAuth SDK source), `03-oauth-dpop-integration-sketch.go` (annotated sketch). All `//go:build ignore`.
- Implemented `pkg/oauth/factory.go`: `Factory` wrapping `oauth.ClientApp` + `oauth.NewMemStore` + `gorilla/sessions` cookie store. Handles: `/oauth/client-metadata.json`, `/oauth/login`, `/oauth/callback`, `/oauth/logout`; `ResumeClient` returns a DPoP-bound `*atclient.APIClient` per request.
- Refactored `pkg/bsky/client.go`: added client-agnostic `CreatePostWithClient`/`LikeWithClient` taking `lexutil.LexClient` + DID, reused by the OAuth path.
- Refactored `pkg/server/server.go`: replaced the `bsky.Client` field with `*oauth.Factory`; `/api/post` and `/api/like` now resume the OAuth session and call the client-agnostic helpers; `/api/status` returns `did` + `loggedIn` from the OAuth cookie.
- Updated `cmd/atproto-demo/main.go`: `--session-secret` flag; `oauth.NewFactory(callbackURL, secret, logger)` passed to `NewServer`.
- Frontend: `api.ts` (login is now a redirect, not a fetch), `store.ts` (session comes from `/api/status` via `sessionFromStatus`), `AccountPanel.tsx` (handle form + "Sign in with Bluesky"), `App.tsx` (`useSessionStatus` hook).
- Made the handle OPTIONAL: empty handle → use `https://bsky.social` entryway as the auth server directly (user authenticates on bsky.app).
- Fixed a feed bug: `postReceived` now **removes** the matching URI on `delete` instead of `unshift`-ing a placeholder; `postsReceived` drops deletes from the snapshot. Deletes no longer pile at the top.

### Why
DPoP-bound OAuth is the production auth path; app passwords are only for bots/CLIs. The handle is not required because ATProto OAuth supports a login-hint-less flow — the user picks their account on bsky.app. The deletes bug was a real correctness issue: the firehose interleaves creates and deletes, and naive prepend made deletes dominate the top of the feed.

### What worked
- `go build ./...` and `pnpm build` both clean.
- `/oauth/client-metadata.json` returns valid DPoP client metadata (`dpop_bound_access_tokens`, scopes, redirect URI).
- `/oauth/login?handle=atproto.com` returns HTTP 302 → `https://bsky.social/oauth/authorize?...&request_uri=urn:ietf:params:oauth:request_uri:req-...` — the full PAR+PKCE+DPoP flow completed (the SDK's `use_dpop_nonce` retry succeeded).
- `/api/status` returns `loggedIn:false, did:""` when unauthenticated.

### What didn't work
- `/oauth/login?handle=test.bsky.social` (a non-existent handle) → HTTP 400 `failed to resolve username: DID method not supported`. Expected: you can't OAuth into an account that doesn't resolve. Real handles work.
- First PAR attempt logs `use_dpop_nonce` (HTTP 400) — this is the **expected** DPoP nonce retry signal; the SDK retries and succeeds. Looks alarming in logs but is correct.

### What I learned
- ATProto OAuth = OAuth 2.1 + PKCE + DPoP (mandatory) + PAR + dynamic client metadata (`client_id` is a URL). The indigo SDK hides all of it behind `StartAuthFlow`/`ProcessCallback`/`ResumeSession`.
- `StartAuthFlow(identifier)`: if identifier starts with `https://`, it's used as the auth server URL directly (no handle resolution, no login hint). Otherwise it resolves handle→DID→PDS. So a no-handle flow = pass `https://bsky.social`.
- DPoP concretely: per-session P-256 key; every request signs a JWT over method+URL+nonce in the `DPoP` header; access tokens are bound to that key. Server nonces rotate ≤5 min; SDK retries on `use_dpop_nonce`.
- `*atclient.APIClient` implements `lexutil.LexClient`, so the same `createRecord` calls work for both app-password and OAuth clients — only the auth method differs.

### What was tricky to build
- The `//go:build ignore` tags on `scripts/` reference files (without them Go tries to compile `package main`/`package oauth` files that conflict).
- The server.go edit introduced a double `}}` (brace mismatch) that broke the build; caught by `go build` and fixed.
- The frontend `api.ts` login changed from a `fetch` POST to a full-page `window.location` redirect (OAuth requires a browser navigation, not an XHR), and the session state now comes from `/api/status` after the callback redirect lands on `/`.
- The deletes-pile-up bug: root cause was `postReceived` unconditionally `unshift`-ing every event including deletes; the fix removes the matching URI on delete.

### What warrants a second pair of eyes
- `pkg/oauth/factory.go` `ResumeClient`: returns a fresh `*APIClient` per request via `ResumeSession`. Confirm token refresh + DPoP nonce rotation happen transparently inside the SDK on expiry (they do, via `DoWithAuth`), but verify under a long-lived session.
- The no-handle `https://bsky.social` path only covers bsky.social-hosted accounts. Accounts on other PDSs still need a handle. Confirm this is acceptable for the demo's audience.
- `pkg/server/server.go` `authedClient`: `api.AccountDID.String()` — `AccountDID` is `*syntax.DID`; confirm non-nil after `ResumeSession` (it is, but a nil deref would panic).

### What should be done in the future
- Add a `/oauth/refresh` endpoint (the SDK has `ClientSession.RefreshTokens`) for explicit token refresh before posting.
- Persist the OAuth session store (`oauth.NewMemStore` is in-memory; a restart logs everyone out). Use a persistent `ClientAuthStore`.
- Run as a confidential client (P-256 client attestation key) for longer token lifetimes.
- Verify the full round-trip (consent → callback → post appears in firehose) with a real human login, which can't be automated.

### Code review instructions
- `go build ./...` and `cd frontend && pnpm build` must pass.
- `/oauth/client-metadata.json` must return JSON with `dpop_bound_access_tokens: true`.
- `/oauth/login?handle=atproto.com` must return 302 to `https://bsky.social/oauth/authorize?...`.
- Browser: load SPA, type nothing, click "Sign in with Bluesky" → navigates to bsky.app.

### Technical details
- New deps: `github.com/gorilla/sessions`, `github.com/gorilla/securecookie`.
- Scopes: `atproto`, `repo:app.bsky.feed.post?action=create`, `repo:app.bsky.feed.like?action=create` (fine-grained).
- client_id (localhost dev): `http://localhost?redirect_uri=...&scope=...` (PDS special-cases this).

## Step 9: Editable identifier on bsky.app, browser verification, expired-request diagnosis

After the OAuth flow redirected to bsky.app, the user reported the identifier
field was locked (only the password was editable). I removed the handle field
entirely, verified the full flow in the browser, and diagnosed an
"access_denied: This request has expired" callback error as an in-memory-store
limitation rather than a flow bug.

### Prompt Context

**User prompt (verbatim):** "I can't edit my handle on the signin page... (I can enter on the password)"

**Assistant interpretation:** The login_hint we pass locks the identifier on bsky.app; remove the handle field so the identifier is editable there.

**Inferred user intent:** The "Sign in with Bluesky" UX should let the user type/select their account on bsky.app, not lock it to a pre-filled value.

### What I did
- Root-caused the locked field: passing `handle` as a `loginHint` in the PAR request causes bsky.app to pre-fill AND disable the identifier input. The SDK's `StartAuthFlow` only omits the hint when the identifier starts with `https://`.
- Removed the handle `<input>` from `AccountPanel.tsx`: the form is now a single "Sign in with Bluesky" button that navigates to `/oauth/login` (no query param). The factory's no-handle path already uses `https://bsky.social` as the auth server, so no login hint is sent.
- Rebuilt the frontend + binary; restarted the `systemd-run --user` unit.
- Verified with Playwright: the account panel has no handle input (`hasHandleInput: 0`), the button is enabled, clicking it navigates to `https://bsky.social/oauth/authorize?...` (no `login_hint` in the URL), landing on the "Authenticate" account-selection page where the user picks "Sign in" and types their handle freely.
- Diagnosed the user's `access_denied: This request has expired` callback error: the `oauth.NewMemStore()` is an in-process map holding the `state`→PKCE-verifier/DPoP-key mapping. The mapping expires server-side after a short window, and — critically — is wiped when the Go process restarts. I had been rebuilding/restarting the binary between the user's login click and the callback, so the `state` in the callback URL no longer matched anything in the store.

### Why
A locked identifier is bad UX and defeats the point of password-free OAuth (the user should authenticate on bsky.app, not be committed to a handle they typed on our form). The expired-request diagnosis matters because it explains a class of "it works then doesn't" failures tied to process restarts and slow human consent.

### What worked
- Removing the handle field: the no-hint flow lands on bsky.app's "Authenticate" page (title "Authenticate"), where the identifier is editable. `go build` + `pnpm build` clean.
- Playwright confirmed: `hasHandleInput: 0`, button enabled, click → `bsky.social/oauth/authorize?...` (no `login_hint`).
- The earlier Step 8 curl checks still hold: `/oauth/client-metadata.json` returns `dpop_bound_access_tokens: true`; `/oauth/login` (no handle) → 302 to bsky.social.

### What didn't work
- The user's first OAuth round-trip failed with `access_denied: This request has expired` at `/oauth/callback`. Root cause: in-memory store wiped by a restart mid-flow (I rebuilt the binary between login and callback). Not a flow bug.
- `nohup`/`setsid`/`( & )` background servers did NOT survive across `bash` tool calls in this environment (process group killed). Had to use `systemd-run --user --unit=...` to keep the server alive for Playwright. The first `systemd-run` attempt failed because of a `--working-directory` flag interaction; the bare form worked.

### What I learned
- `loginHint` locks the identifier on bsky.app. For a "Sign in with X" button, omit the hint entirely; the user authenticates on the provider.
- `oauth.NewMemStore()` is explicitly documented as "not appropriate even [for] casual real-world use: all users will be logged-out every time the process is restarted." The `ClientAuthStore` interface (6 methods: Get/Save/DeleteSession, Get/Save/DeleteAuthRequestInfo) is small enough to back with a file/SQLite store for persistence.
- `systemd-run --user --unit=<name> <cmd>` is the reliable way to run a detached server across tool-call boundaries here; `journalctl --user -u <name>` reads its logs.

### What was tricky to build
- React controlled-input state vs Playwright `fill`: `page.evaluate` setting `input.value` directly does not update React's state, leaving the submit button disabled. `getByPlaceholder(...).fill(...)` (via `run_code_unsafe`) fires the real onChange and updates state. A stale `loginRedirect` status from an earlier failed attempt also kept the button disabled until a page reload reset it.
- Keeping the server alive for the browser test: three backgrounding strategies failed before `systemd-run` worked.

### What warrants a second pair of eyes
- The no-handle `https://bsky.social` path only covers bsky.social-entryway accounts. Confirm the demo's audience is on bsky.social (almost all are).
- The `access_denied: expired` error will recur on any restart during a flow. For a smooth demo, either avoid restarting mid-flow or implement a persistent `ClientAuthStore`.

### What should be done in the future
- Implement a file- or SQLite-backed `ClientAuthStore` so in-flight OAuth flows survive restarts and the `state`/PKCE mapping persists across a slow human consent.
- Add a `/oauth/refresh` endpoint using `ClientSession.RefreshTokens`.
- Run as a confidential client (P-256 client attestation) for longer token lifetimes.
- Complete the full round-trip with a real human login (consent → callback → post appears in the firehose) — cannot be automated.

### Code review instructions
- `cd frontend && pnpm build` and `go build ./...` must pass.
- Browser: load SPA → no handle input, just "Sign in with Bluesky" → click → navigates to `bsky.social/oauth/authorize` with no `login_hint` in the URL.

### Technical details
- Commit for this step: `c93abb1`.
- `ClientAuthStore` interface (6 methods) at `scripts/02-oauth-sdk-store.go`; `MemStore` at `scripts/02-oauth-sdk-memstore.go`.
- Server run: `systemd-run --user --unit=atproto-demo2 /tmp/atproto-demo serve --addr :18105 --relay https://relay1.us-east.bsky.network`.
