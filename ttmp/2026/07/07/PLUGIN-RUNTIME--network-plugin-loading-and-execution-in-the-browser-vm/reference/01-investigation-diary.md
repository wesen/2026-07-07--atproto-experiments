---
Title: Investigation Diary
Ticket: PLUGIN-RUNTIME
Status: active
Topics:
    - plugins
    - frontend
    - sandbox
    - vm
    - atproto
    - browser
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: /home/manuel/code/wesen/2026-07-07--browser-js-inject-vm/src/components/PluginCatalog.tsx
      Note: |-
        Unified catalog UI (Step 1 study)
        unified catalog with network sections
    - Path: /home/manuel/code/wesen/2026-07-07--browser-js-inject-vm/src/plugins/manifest.ts
      Note: PluginManifestEntry extension (Step 1 study)
    - Path: /home/manuel/code/wesen/2026-07-07--browser-js-inject-vm/src/runtime/plugin-runtime/runtimeService.ts
      Note: loadRuntimeBundle load seam (Step 1 study)
    - Path: abs:///home/manuel/code/wesen/2026-07-07--browser-js-inject-vm/src/host/usePluginRuntime.ts
      Note: FRP loop consuming bundleCode unchanged
ExternalSources: []
Summary: |
    Chronological investigation diary for PLUGIN-RUNTIME: studying the browser-js-inject-vm plugin VM to design network plugin loading, bookmarking, and untrusted-plugin execution.
LastUpdated: 2026-07-07T00:00:00Z
WhatFor: Record the design investigation for PLUGIN-RUNTIME.
WhenToUse: Read before resuming work on PLUGIN-RUNTIME.
---






# Investigation Diary

## Goal

Capture the study and design of the execution side of social JS plugin
sharing: discovering plugins from a feed, bookmarking, fetching source over
the network, and running it in the existing QuickJS VM.

## Step 1: Study the browser VM and design the network load + execution paths

Studied the browser-js-inject-vm runtime to identify the load seam, then
designed the network loader, bookmark store, unified catalog, and untrusted
security policy.

### Prompt Context

**User prompt (verbatim):** (see PLUGIN-SHARING Step 1; same prompt)

**Assistant interpretation:** Design how the browser VM consumes the plugin feed from PLUGIN-SHARING: discovery, bookmark opt-in, fetch, and sandboxed execution.

**Inferred user intent:** A design that lets a user discover plugins others published, pick the ones they want, and run them safely in the existing sandbox.

### What I did
- Read `runtimeService.ts` `loadRuntimeBundle(stackId, sessionId, packageIds, code)` — confirmed `code: string` is the load seam; runtime is agnostic to the source of the string.
- Read `manifest.ts` — `PluginManifestEntry` with `bundleCode` from `?raw` imports; the explicit limitation documented in the README.
- Read `feed-keyword-lens.vm.js` — the canonical bundle shape a network plugin must match.
- Read `contracts.ts` — `RuntimeBundleMeta`, `RuntimeBundleHooksMeta`, hook input/output contracts.
- Read `PluginCatalog.tsx`, `SocialFeed.tsx`, `usePluginRuntime.ts` — how entries flow into the catalog and FRP host.
- Designed: network loader (`fetchFeed`/`summaryToEntry`/`loadNetworkSource`), bookmark store (localStorage), `clampCapabilities` for untrusted plugins, CID verification, unified catalog with opt-in.
- Wrote the 15-section design guide with an end-to-end publish-to-run trace connecting both tickets.

### Why
The design hinges on the load seam being `code: string`. Confirming that empirically (by reading the method) lets the design reuse the entire runtime unchanged, which keeps the security boundary and tests intact.

### What worked
- The load seam made the design a "change the source of the string, not the runtime" problem. No sandbox fork needed.
- The existing three-layer security model (isolation, data-only, capability gating) extends cleanly with a fourth layer (opt-in + content addressing).

### What didn't work
- N/A (design-only step).

### What I learned
- `loadRuntimeBundle` validates package IDs against installed packages and throws on mismatch — a network plugin declaring an unknown package fails loudly, which is the correct behavior.
- Bookmarks double as the opt-in gate AND the user's personal selection — one mechanism, two purposes.
- CID verification requires matching ATProto's CIDv1/DAG-CBOR/SHA-256 computation; this is the main implementation risk.

### What was tricky to build
- The capability clamp: network plugins declare capabilities in their record, but those declarations are untrusted. Decided to intersect declared caps with a safe allowlist (`feed` domain only, no system) rather than trust the declaration.

### What warrants a second pair of eyes
- CID computation: confirm the browser uses the same multiformats/CIDv1 encoding as the PDS, or fall back to trusting the server-returned CID for v1.
- The `ensureSource` lazy-fetch path: confirm `PluginManifestEntry.bundleCode` mutation (caching the fetched source on the entry) does not break React identity assumptions (the SocialFeed memoization lesson from the Obsidian report).

### What should be done in the future
- WebSocket feed subscription for real-time discovery (v1 polls).
- Bookmark records for cross-device sync.
- Per-plugin trust grants widening the capability clamp.
- Pre-validate `packageIds` against the installed set in the catalog before launch.

### Code review instructions
- Read `design-doc/01-...md` §5 (load seam) and §7 (security policy).
- Confirm against `browser-js-inject-vm/src/runtime/plugin-runtime/runtimeService.ts` that `loadRuntimeBundle` signature is unchanged.

### Technical details
- No code commit (design-only). Design guide: `design-doc/01-network-plugin-loading-design-implementation-guide.md`.

## Step 2: Implement network loader, bookmarks, catalog (Phases 1-3)

Implemented the execution side in the browser-js-inject-vm repo: network
loader, bookmark store, feed poller, unified catalog, and lazy source fetch.

### Prompt Context

**User prompt (verbatim):** "GO ahead." (then) "commit at appropriate intervals, and keep a detailed diary as you work."

**Assistant interpretation:** Implement PLUGIN-SHARING then PLUGIN-RUNTIME, committing at intervals and keeping the diary current.

**Inferred user intent:** Turn both design guides into working code end to end.

### What I did
- `src/plugins/networkLoader.ts`: `fetchFeed`, `summaryToEntry`, `loadNetworkSource`, `ensureSource`, `parseAtURI`, `clampCapabilities` (feed-domain-only allowlist), in-memory URI→{entry,source} cache.
- `src/plugins/bookmarks.ts`: localStorage store + `bookmarks-changed` events (the opt-in gate).
- `src/plugins/useNetworkFeed.ts`: `useNetworkFeed` 30s poller + `useBookmarkedPlugins` + `useIsBookmarked` hooks.
- `src/plugins/manifest.ts`: added `origin`/`uri`/`cid` to `PluginManifestEntry`; marked built-ins `origin:'builtin'`.
- `src/components/PluginCatalog.tsx`: unified catalog — bookmarked-network (launchable), built-in, and Discover (bookmark-to-enable) sections; async source fetch before launch/view-source; Add/Remove toggle.
- `vite.config.ts`: `server.proxy` forwarding `/api/plugins/*` → `http://localhost:18112` (the atproto-experiments server), `VITE_PLUGIN_API_BASE` override.
- `src/plugins/networkLoader.test.ts`: 10 unit tests.

### Why
The load seam is `loadRuntimeBundle(code:string)`; reusing it unchanged keeps the sandbox, validation, and action routing intact. The bookmark store is the opt-in gate that prevents drive-by execution of firehose content.

### What worked
- `pnpm typecheck` clean; `pnpm test` → 47 passed (37 existing + 10 new); `pnpm build` clean.
- End-to-end proxy verification: `curl http://localhost:5173/api/plugins/feed` → `{"plugins":[]}` (Vite dev proxy → atproto server on :18112); `list` and page load (HTTP 200) all work.

### What didn't work
- First `systemd-run` of the Vite dev server failed with `Command "dev" not found` because systemd-run does NOT inherit the calling shell's cwd. Fixed with `--working-directory=/home/manuel/code/wesen/2026-07-07--browser-js-inject-vm`.
- Playwright MCP browser was disconnected (killed earlier clearing a SingletonLock); could not do in-browser UI verification. Fell back to curl + typecheck + build + tests.

### What I learned
- `systemd-run --user` runs in the user's home, not the invoking cwd. Always pass `--working-directory=` for commands that depend on a repo's package.json.
- The Vite `server.proxy` cleanly bridges the two repos in dev without CORS, using relative `/api/plugins/*` URLs that work in both dev (proxy) and a single-origin production deploy.
- The catalog's `useBookmarkedPlugins` resolves bookmark URIs through the loader cache, so a bookmark whose summary hasn't been delivered by the feed yet is simply skipped until the feed catches up — no error.

### What was tricky to build
- Stable entry identity: the feed poller recreates summaries each tick. `cacheEntry` keeps a stable `PluginManifestEntry` reference per URI so that `bundleCode` fetched once persists across renders (avoids the React identity / re-fetch problem flagged in the design guide).
- The launch path: `PluginSurfaceHost` calls `loadRuntimeBundle(..., plugin.bundleCode)`. For network plugins `bundleCode` is empty until fetched, so the catalog's `launch()` awaits `ensureSource(plugin)` before calling `onSelect`. The same guard protects View-source.

### What warrants a second pair of eyes
- CID verification is deferred (v1 trusts the server-returned source). The design guide's DR-4 calls for DAG-CBOR/CIDv1 verification; implementing it needs the `multiformats`+`@ipld/dag-cbor` libraries. Confirm whether to add them or accept v1's trust-the-server stance.
- `clampCapabilities` drops ALL system actions for network plugins. A plugin that legitimately needs `notify.show` cannot get it in v1. Confirm this is acceptable.
- The catalog mutates `entry.bundleCode` on the cached object after `ensureSource`. Confirm no other code path holds a stale reference to the pre-fetch entry.

### What should be done in the future
- Real-time feed via WebSocket (v1 polls every 30s).
- CID verification (add multiformats/dag-cbor).
- Bookmark records for cross-device sync.
- Feed-middleware network plugins in the SocialFeed sidebar (Phase 4).
- Per-plugin trust grants widening the capability clamp.

### Code review instructions
- `cd browser-js-inject-vm && pnpm typecheck && pnpm test && pnpm build`.
- `curl http://localhost:5173/api/plugins/feed` (with both servers up) → `{"plugins":[]}`.
- Read `src/plugins/networkLoader.ts` (`clampCapabilities`, `ensureSource`) and `src/components/PluginCatalog.tsx` (`launch`, `viewSource`).

### Technical details
- Commit `83d0cb9` (browser-js-inject-vm: network loader + bookmarks + catalog).
- Full publish→discover→bookmark→run round-trip still needs a human OAuth login to publish the first plugin record (or an explicit app-password publish test).

## Step 3: Merge the runtime INTO the atproto app (one app, no proxy)

The user flagged that PLUGIN-RUNTIME had been built as a SECOND app
(browser-js-inject-vm) talking to the atproto server via a Vite proxy —
not "merged into the same app." This step vendors the QuickJS runtime into
the atproto-experiments frontend so everything is one app: single origin,
single Go binary (go:embed), no proxy.

### Prompt Context
**User prompt (verbatim):** "wait, didn't we merge both into the same app? this seems to be the original app?"

**Assistant interpretation:** Stop the two-app split; merge the plugin runtime into the atproto-experiments frontend.

**Inferred user intent:** One unified app that publishes, discovers, bookmarks, AND runs plugins.

### What I did
- Verified the runtime is React-18-compatible (only stable hooks; no React 19 features) → no version upgrade needed.
- Added quickjs-emscripten deps to atproto frontend package.json.
- Vendored `src/runtime` + `src/ui` + `src/host` (~4600 lines, 33 files, tests excluded) from browser-js-inject-vm.
- Added `src/vite-env.d.ts` (?raw module types), `src/features/feed/feedSlice.ts` (satisfies host/store.ts).
- Ported `src/plugins/{networkLoader,bookmarks,useNetworkFeed}.ts` SAME-ORIGIN (removed the Vite proxy — fetch /api/plugins/* directly).
- Created `src/plugins/manifest.ts` (Counter built-in) + `src/components/PluginTab.tsx` (catalog + launch via PluginSurfaceHost, nested runtime Redux store).
- Wired a 4th "Plugins" tab into App.tsx.

### Why
The backend (firehose, OAuth, publish, feed, repo) lives in atproto-experiments and embeds its frontend via go:embed → that is the natural single-app home. Two apps + a proxy was the wrong shape.

### What worked
- `tsc --noEmit` clean; `pnpm build` clean.
- Playwright: Plugins tab renders built-ins; launching Counter runs it IN-PAGE (QuickJS eval + render "Count: 0" + bump → "Count: 1"); 0 console errors.

### What didn't work
- N/A (clean merge).

### What I learned
- The runtime store (host/store.ts) and the atproto store can coexist via a NESTED <Provider store={runtimeStore}> around just the Plugins tab: runtime selectors read the runtime store; the rest reads the atproto store. No store merge needed.
- `?raw` imports need a `vite-env.d.ts` declaring `*.vm.js?raw`; without it tsc errors on the bootstrap/ui-package imports.

### What was tricky to build
- The two-store bridge: the runtime's `usePluginRuntime`/selectors bind to the nearest Provider. Wrapping only the Plugins tab in the runtime Provider isolates it cleanly.

### What warrants a second pair of eyes
- The vendored runtime is a frozen copy (no longer shares code with browser-js-inject-vm). Drift is now possible. Consider extracting a shared package later.
- `registerUiRuntime()` is called at PluginTab module load (once). Confirm it's idempotent across tab switches (it registers into a module-level registry; re-mount should be a no-op).

### What should be done in the future
- Extract the runtime into a shared package to avoid vendored drift.
- Bring the SourceViewer (syntax highlighting) over for the source modal.

### Code review instructions
- `cd frontend && pnpm exec tsc --noEmit && pnpm build`.
- Playwright: Plugins tab → Launch Counter → bump → count increments.

### Technical details
- Commit `a8c0219` (merge: vendored runtime + Plugins tab).

## Step 4: Firehose middleware — plugins filter the LIVE firehose

The user asked for plugins loaded in the firehose view to filter/manipulate
the live feed (like the browser-js-inject-vm SocialFeed demo, but over real
firehose posts instead of a simulator).

### Prompt Context
**User prompt (verbatim):** "can we have plugins loaded in the firehose view and have things similar to the demo, with plugins to filter / manipulate the firehose"

**Assistant interpretation:** Wire feed-middleware plugins (feed.apply) into the live firehose view.

**Inferred user intent:** A firehose tab with a plugin sidebar where active plugins filter/manipulate visible posts in real time.

### What I did
- Ported `src/features/feed/{feedPluginPipeline,useFeedPluginPipeline}.ts` (pure helpers + the runtime-aware pipeline hook).
- Copied 4 feed-middleware .vm.js plugins (Keyword Lens, Author Mute, Freshness Window, Topic Tagger) into the manifest's FEED_PLUGINS.
- `src/components/FirehosePlugins.tsx`: sidebar (add/remove feed plugins) + `useFeedPluginPipeline(activeSessions, posts)` + visible-posts list + trace; wrapped in the runtime Provider.
- `Feed.tsx`: maps atproto Post → FeedPost (`{id:uri, author:did, text, ts, tags}`), caps to 60 (the firehose delivers ~40/s into a 500 buffer; capping bounds the per-tick pipeline cost), renders `<FirehosePlugins posts={feedPosts} />`.
- No simulator/incoming-message path: the firehose IS the live source; only `feed.apply` is used (plugins filter already-arrived posts; hiddenPostIds/filtered posts).

### Why
This is the SocialFeed demo's `feed.apply` chain applied to real data. Plugin-local state (query, mute list) lives in the runtime store; editing it reruns the pipeline (pluginStateVersion dependency).

### What worked
- Playwright: 60 posts streaming; add Keyword Lens → panel renders; type "zzzzz" → 0/60 visible; clear → 60/60 restored; `filteringWorked: true`; 0 console errors.
- The two-store bridge holds: firehose posts (atproto store) flow in as a prop; pipeline selectors read the runtime store.

### What didn't work
- N/A.

### What I learned
- The pipeline re-runs on every firehose post (the atproto store rebuilds the array each tick). Capping to 60 posts keeps each run cheap; for higher volume, debounce the pipeline or use a stable posts-identity (e.g. a version counter).
- `useFeedPluginPipeline`'s apply path uses only the `posts` prop + runtime-store plugin state; it does NOT touch the vendored feedSlice, so the firehose posts need not be synced into the runtime store.

### What was tricky to build
- Performance: the live firehose (~40/s) vs the SocialFeed's slow simulator. Solved by capping posts to 60 for the pipeline + display. A real app would debounce.
- The atproto Post uses `did` as author; Keyword Lens filters by author/text, so a DID fragment works as a filter.

### What warrants a second pair of eyes
- The 60-post cap is a demo compromise; confirm it's acceptable or implement debouncing for higher-volume relays.
- Pipeline runs on every post tick even when no plugins are active (the effect deps include `posts`). Could short-circuit when `active.length === 0`.

### What should be done in the future
- Debounce/throttle the pipeline for high-volume firehoses.
- Short-circuit the pipeline when no plugins are active (show raw posts).
- Network feed-middleware plugins (from PLUGIN-SHARING) in the same sidebar.
- The incoming-message hook for a compose/preview path.

### Code review instructions
- Playwright: Firehose tab → add Keyword Lens → type a filter → visible count drops; clear → restores.
- Read `src/components/FirehosePlugins.tsx` + `src/Feed.tsx` (toFeedPost, PIPELINE_CAP).

### Technical details
- Commit `a8c0219` (firehose middleware, same commit as the merge).

## Step 5: Network feed-middleware plugins in the firehose sidebar

Extended the firehose so a PUBLISHED feed-middleware plugin (not built-in)
can run its feed.apply over the live firehose. This completes the social loop
for feed middleware: publish -> discover -> bookmark -> filter the live feed.

### Prompt Context
**User prompt (verbatim):** "continue."

**Assistant interpretation:** Continue with the next steps (network feed-middleware in the firehose sidebar was the natural completion).

**Inferred user intent:** A published feed-middleware plugin should be usable in the firehose, not just standalone apps in the Plugins tab.

### What I did
- `manifest.ts`: added `hooks?: { feedMiddleware?; incomingFeedMessage? }` to PluginManifestEntry.
- `networkLoader.ts`: `summaryToEntry` now carries `hooks` from the feed summary onto the entry.
- `FirehosePlugins.tsx`: the 'Add feed plugin' list = FEED_PLUGINS + bookmarked network plugins whose `hooks.feedMiddleware === true` (marked with a sparkle). `addPlugin` awaits `ensureSource` for network plugins before adding to active, so `bundleCode` is populated before `PluginPanelHost` mounts and calls `loadRuntimeBundle`. Entries resolve via `findPlugin(id) || getCachedEntry(id)` so network plugins (keyed by AT URI) resolve.
- `publish-plugin`: publishes a 'Firehose Keyword Filter' feed-middleware plugin (declares `hooks.feedMiddleware` + implements `feed.apply`).

### Why
The firehose sidebar previously only offered built-in feed-middleware plugins. Letting a bookmarked network feed-middleware plugin run there closes the loop: the plugin's `feed.apply` runs over the LIVE firehose posts, not a simulator.

### What worked
- Playwright: published Firehose Keyword Filter -> firehose feed showed it -> Plugins tab Discover -> bookmarked -> Firehose sidebar now lists it (sparkle) alongside built-ins -> added -> panel rendered input -> typed 'zzzzz' -> 0/60 visible (network feed.apply filtered the live firehose) -> cleared -> 60/60 restored. 0 console errors.
- The runtime determines hooks from the bundle meta (`getBundleMeta().hooks.feedMiddleware`, computed by the bootstrap checking `typeof __runtimeBundle.feed?.apply === 'function'`), so the published plugin's real `feed.apply` is what makes it eligible — the record's `hooks` field is only the catalog hint.

### What didn't work
- A stray `publish-plugin` binary was committed by an earlier `go build ./cmd/publish-plugin` (built into the repo root). Removed + gitignored (commit c15b25f).

### What I learned
- The firehose feed-middleware sidebar and the Plugins-tab launcher share the same session/pipeline machinery; the only addition was (a) including bookmarked network feed-middleware plugins in the add-list and (b) lazy-fetching source on add.
- A network feed plugin must be BOOKMARKED before it appears in the firehose add-list — the bookmark is the single opt-in gate for both standalone and feed-middleware network plugins.

### What was tricky to build
- Entry resolution: built-ins resolve via `findPlugin(id)`; network plugins are keyed by their AT URI (which is the entry `id`), so the resolver falls back to `getCachedEntry(id)`. Without this, adding a network feed plugin rendered nothing (`findPlugin` returned undefined).
- Source timing: `PluginPanelHost` calls `loadRuntimeBundle(..., plugin.bundleCode)` on mount. For a network plugin `bundleCode` is empty until fetched, so `addPlugin` must `await ensureSource(entry)` BEFORE adding to `active` — otherwise the panel mounts with empty code and fails.

### What warrants a second pair of eyes
- Duplicate publishes accumulate (each `publish-plugin` run creates new records with new rkeys). The feed shows all of them. A dedup-by-title or latest-only view would clean this up for a real catalog.
- The network feed-middleware plugin gets the `feed` capability via `clampCapabilities`; confirm a malicious `feed.apply` cannot do more than filter/annotate (it returns posts/annotations which the host normalizes — it cannot touch other domains).

### What should be done in the future
- Dedup the feed/catalog by title or latest version.
- Short-circuit the pipeline when no plugins are active (avoid per-tick re-renders on the raw feed).
- CID verification for fetched source.

### Code review instructions
- Playwright: Plugins tab -> bookmark Firehose Keyword Filter -> Firehose tab -> add it -> type filter -> visible drops.
- Read `src/components/FirehosePlugins.tsx` (addList, addPlugin, resolveEntry).

### Technical details
- Commit `9148bd1` (network feed-middleware in firehose) + `c15b25f` (gitignore artifact).

## Step 6: CID verification for fetched plugin source (DR-4)

Added cryptographic integrity verification: the browser now proves the fetched
plugin source matches the record's ATProto content-addressed CID before
loading, closing the v1 trust gap.

### Prompt Context
**User prompt (verbatim):** "add CID verification"

**Assistant interpretation:** Implement the deferred DR-4: verify fetched plugin source against the record's CID in the browser.

**Inferred user intent:** Upgrade the trust model from consent-and-inspection to self-certifying (the bytes that run are provably what the author published).

### What I did
- Added `multiformats` + `@ipld/dag-cbor` deps to the atproto frontend.
- `networkLoader.ts`: `computeRecordCID(value)` = `CID.createV1(dagcbor.code (0x71), sha256.digest(dagcbor.encode(value)))`; `verifyRecordCID(value, declaredCID)`.
- Wired into `loadNetworkSource`: after fetching the record, (a) the fetched `value` must hash to the record's `getRecord` CID, and (b) that CID must agree with the firehose-announced CID (`entry.cid`). Either mismatch throws and the plugin is refused.

### Why
ATProto records are content-addressed; the CID is the integrity guarantee. Using it makes "the source that runs" equal to "the source the author published," independent of whether the atproto-experiments server or a MITM returns different bytes.

### What worked
- Empirical proof BEFORE wiring: a node script recomputed the CID of a real fetched record and it EXACTLY matched the PDS-declared CID (`bafyreias5j2...` == `bafyreias5j2...`). The DAG-CBOR round-trip (JSON -> canonical DAG-CBOR -> sha256 -> CIDv1) is byte-identical to the PDS's stored block for inline-source records.
- Node logic test: self-match true, tampered value -> different CID (mismatch), correct `bafyrei...` prefix.
- Playwright: launching a network plugin still succeeds (CID passed), renders "Hello from the firehose!", 0 console errors.

### What didn't work
- First attempt added a `networkLoader.test.ts` with vitest globals, but the atproto frontend has no vitest -> `tsc -b` failed (`Cannot find name 'expect'`). Removed the test file (the CID logic is proven by the node script + the in-browser happy path; the .test.ts properly belongs in browser-js-inject-vm which has vitest, but that repo lacks the CID functions — a gap accepted for now).

### What I learned
- `@ipld/dag-cbor`'s `encode()` produces canonical DAG-CBOR (length-first key ordering) regardless of input order, matching the PDS's canonical storage. So JSON key order does not matter.
- The CID prefix `bafyrei...` identifies dag-cbor (codec 0x71) + sha2-256, which is how to sanity-check the computation at a glance.
- The round-trip is clean ONLY for records without nested CID links or bytes. A `sourceBlob` field (`{ $link: "bafy..." }`) would encode as a plain map, NOT a CBOR-tagged CID, and would mismatch the original. v1 uses inline source, so this does not arise; documented as a limitation.

### What was tricky to build
- The risk was a false rejection from an encoding mismatch. De-risked by empirically testing the CID computation against a REAL PDS record BEFORE wiring it in — confirming the match before committing to the implementation.
- Deciding which CID to verify against: the `getRecord` response CID AND the firehose-announced `entry.cid` (independent paths). Verifying against only one would miss a tampering case where the server changed both source and CID consistently; the cross-check catches that.

### What warrants a second pair of eyes
- The blob limitation: if a future record uses `sourceBlob`, `verifyRecordCID` would falsely reject. Fix = walk the value and convert `{$link}` to `CID.parse(...)` before encoding (dag-cbor then emits the CBOR tag). Not needed in v1.
- The `verifyRecordCID(value, '')` no-op (returns true when no CID declared). Confirm this is acceptable vs. refusing when no CID is present.

### What should be done in the future
- Handle `sourceBlob` records (convert `$link` -> CID before encoding).
- Move the CID tests into a repo with vitest (browser-js-inject-vm, once it has the CID functions, or extract the runtime).

### Code review instructions
- `node` script: `dagcbor.encode(value)` -> `sha256.digest` -> `CID.createV1(dagcbor.code, hash)` -> `.toString()` matches PDS CID.
- Playwright: bookmark + launch a network plugin -> runs (CID passed).

### Technical details
- Commit `a679426` (CID verification).
