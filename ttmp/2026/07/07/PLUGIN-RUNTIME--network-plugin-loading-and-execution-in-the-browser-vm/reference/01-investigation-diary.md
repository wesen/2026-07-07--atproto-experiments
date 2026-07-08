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
      Note: Unified catalog UI (Step 1 study)
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
