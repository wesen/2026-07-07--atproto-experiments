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
