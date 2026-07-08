# Changelog

## 2026-07-07

- Initial workspace created


## 2026-07-07

Wrote 15-section design guide: network loader reusing loadRuntimeBundle(code), bookmark store, capability clamp, CID verification, unified catalog

### Related Files

- /home/manuel/code/wesen/2026-07-07--atproto-experiments/ttmp/2026/07/07/PLUGIN-RUNTIME--network-plugin-loading-and-execution-in-the-browser-vm/design-doc/01-network-plugin-loading-design-implementation-guide.md — Design guide


## 2026-07-07

Uploaded design guide + diary bundle to reMarkable at /ai/2026/07/07/PLUGIN-RUNTIME

### Related Files

- /home/manuel/code/wesen/2026-07-07--atproto-experiments/ttmp/2026/07/07/PLUGIN-RUNTIME--network-plugin-loading-and-execution-in-the-browser-vm/design-doc/01-network-plugin-loading-design-implementation-guide.md — reMarkable bundle


## 2026-07-07

Implemented network loader, bookmarks, unified catalog, Vite proxy; 10 unit tests; 47 total pass (commit 83d0cb9 in browser-js-inject-vm)

### Related Files

- /home/manuel/code/wesen/2026-07-07--browser-js-inject-vm/src/plugins/networkLoader.ts — Implementation


## 2026-07-07

Re-uploaded design+diary bundle to reMarkable (with implementation steps)

### Related Files

- /home/manuel/code/wesen/2026-07-07--atproto-experiments/ttmp/2026/07/07/PLUGIN-RUNTIME--network-plugin-loading-and-execution-in-the-browser-vm/reference/01-investigation-diary.md — Impl diary Step 2


## 2026-07-07

Merged QuickJS runtime INTO atproto app (one app, no proxy) + firehose middleware: 4 feed plugins filter the live firehose via feed.apply. Verified Keyword Lens 60/60->0/60->restore. (commit a8c0219)

### Related Files

- /home/manuel/code/wesen/2026-07-07--atproto-experiments/frontend/src/components/FirehosePlugins.tsx — Firehose middleware


## 2026-07-08

VERIFIED end-to-end: discovered published Greeting plugin on the feed, bookmarked it from Discover, launched it -> runs in QuickJS (renders + interactive Next-greeting cycles); 0 console errors

### Related Files

- /home/manuel/code/wesen/2026-07-07--atproto-experiments/frontend/src/components/PluginTab.tsx — round trip


## 2026-07-08

Network feed-middleware plugins run in the firehose sidebar: published Firehose Keyword Filter -> discover -> bookmark -> add to firehose -> feed.apply filters live posts (0/60->60/60). (commits 9148bd1, c15b25f)

### Related Files

- /home/manuel/code/wesen/2026-07-07--atproto-experiments/frontend/src/components/FirehosePlugins.tsx — network feed-middleware in sidebar

