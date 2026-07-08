# atproto-experiments

A single Go binary that embeds a React/Vite/Redux frontend and demonstrates the
full ATProto stack: subscribe to the Bluesky firehose, browse any public
repository, log in with OAuth DPoP, and — the headline feature — **publish,
discover, and run socially-shared JavaScript plugins** inside an in-browser
QuickJS sandbox.

The plugins are not bundled at build time. A plugin is published as an ATProto
record (`dev.atproto-demo.plugin`), arrives on the live firehose, is discovered
in a catalog, bookmarked (opt-in), fetched over HTTP, **content-hash verified**,
and executed in a sandboxed VM. The whole loop runs in one origin.

![Live firehose demo](atproto-demo-live.jpeg)

## What it does

The app has four tabs.

| Tab | What it does |
| --- | --- |
| **Firehose** | Live post stream from a relay, with **feed-middleware plugins** that filter/annotate visible posts in real time (`feed.apply` over the live feed). |
| **Repository** | Walk any public ATProto repo by handle or DID — collections, paginated records, decoded record detail (raw JSON, works for custom Lexicons). |
| **Publish** | Compose a `.vm.js` plugin source + metadata and publish it as a `dev.atproto-demo.plugin` record via OAuth DPoP. |
| **Plugins** | Catalog of built-in and **network-discovered** plugins; bookmark one (opt-in), inspect its source, and run it in a QuickJS sandbox. |

## The social plugin sharing loop

```
publish ──▶ firehose feed ──▶ discover ──▶ bookmark ──▶ fetch+verify ──▶ run in QuickJS
 (OAuth)   (custom Lexicon    (Plugins     (opt-in       (CID check)       (sandbox)
            decode)            tab)         gate)
```

1. An author publishes a plugin record to their repo (the `Publish` tab or the
   `publish-plugin` CLI).
2. The relay firehose carries the commit; the Go consumer decodes the
   `dev.atproto-demo.plugin` record into a summary and pushes it onto the feed.
3. The `Plugins` tab polls `/api/plugins/feed` and shows the plugin under
   **Discover** (marked `net`, not built-in).
4. The user bookmarks it (the opt-in gate; persists in `localStorage`).
5. Launching it fetches the full source from `/api/plugins/record` and
   **verifies the source against the record's ATProto CID** (CIDv1, DAG-CBOR,
   SHA-256) before evaluating it.
6. The source runs in a QuickJS WebAssembly sandbox: no `window`, `document`,
   or `fetch`; a memory cap and deadline interrupt; a data-only action protocol;
   and a clamped capability grant.

## Quick start

```bash
# Frontend (React/Vite/Redux)
cd frontend && pnpm install && pnpm build && cd ..

# Backend (Go + glazed, serves the embedded SPA + API)
go build -o atproto-demo ./cmd/atproto-demo

# Run it against a relay
./atproto-demo serve --addr :8080 \
  --relay https://relay1.us-east.bsky.network \
  --oauth-store ./oauth-store

# open http://localhost:8080
```

Other subcommands:

```bash
./atproto-demo firehose            # stream decoded posts to stdout (debugging)
./publish-plugin --store ./oauth-store   # publish plugins from a persisted OAuth session
```

Flags:

| Flag | Default | Purpose |
| --- | --- | --- |
| `--relay` | `https://relay1.us-east.bsky.network` | relay firehose URL |
| `--addr` | `:8080` | HTTP listen address |
| `--session-secret` | `dev-insecure-secret-change-me` | signs OAuth session cookies (`openssl rand -hex 16`) |
| `--oauth-store` | `./oauth-store` | directory persisting OAuth sessions + auth requests (survives restarts) |

## How it works (the 30-second version)

```
relay firehose ─WebSocket─▶ firehose.Consumer ─▶ ring buffers ─▶ /api + /ws
                                       │
                 decodes app.bsky.feed.post AND dev.atproto-demo.plugin
                 (raw map[string]any — indigo's typed decoder rejects custom Lexicons)

browser ─▶ /api/plugins/feed ─▶ catalog ─▶ bookmark ─▶ /api/plugins/record
                                                         │
                                          CID verify ─▶ loadRuntimeBundle(code) ─▶ QuickJS
```

- The **load seam is a string**: `QuickJSRuntimeService.loadRuntimeBundle(stackId, sessionId, packageIds, code)`
  takes the plugin source as `code`. A bundled plugin gets it from a Vite `?raw`
  import; a network plugin gets it from `fetch()`. Everything downstream — the
  bootstrap kernel, package install, metadata validation, surface rendering,
  action routing — is unchanged.
- **Two Redux stores** coexist via a nested `<Provider>`: the atproto store
  (firehose posts, session) and the runtime store (plugin sessions, plugin
  state, action timeline). They are bridged by passing posts as a prop into the
  runtime-wrapped pipeline.

## Architecture

| Layer | Package / dir | Responsibility |
| --- | --- | --- |
| Firehose | `pkg/firehose` | subscribe to `com.atproto.sync.subscribeRepos`; decode posts + plugin records (raw CBOR) |
| Account | `pkg/bsky` | create post / like (app-password path; legacy) |
| OAuth | `pkg/oauth` | DPoP login + **persistent file-backed session store** |
| Repo browser | `pkg/repobrowser` | describe/list/get via raw `LexDo` (works for any Lexicon) |
| Plugins | `pkg/plugins` | `dev.atproto-demo.plugin` NSID, `Publish` (raw `LexDo` createRecord), `DecodeSummary` |
| HTTP server | `pkg/server` | `net/http.ServeMux` (Go 1.22+ patterns): `/api/*`, `/ws`, OAuth routes, plugin ring buffers |
| Frontend | `frontend/src` | React/Vite/Redux SPA, embedded via `go:embed` |
| Plugin VM | `frontend/src/runtime`, `ui`, `host` | vendored QuickJS runtime (~4,600 lines) |
| Network loader | `frontend/src/plugins` | discovery, bookmarks, capability clamp, **CID verification** |
| Compose UI | `frontend/src/PublishPlugin.tsx` | write + publish a plugin |
| Embed | `embed.go` | `go:embed frontend/dist` |

## The Lexicon

A plugin is a record in the collection `dev.atproto-demo.plugin` (key type
`tid`). Fields: `title`, `description`, `source` (inline JS string, up to
100 KB), optional `sourceBlob`, `version`, `packageIds`, `capabilities`,
`hooks` (`feedMiddleware` / `incomingFeedMessage`), `homeSurface`, `license`,
`createdAt`.

Publishing uses a fine-grained OAuth scope:
`repo:dev.atproto-demo.plugin?action=create` — the token can only create
records in that one collection.

## Safety model (four layers)

1. **Execution isolation** — each plugin runs in a separate QuickJS WASM
   context with no host globals, a 32 MiB memory cap, and a deadline interrupt.
2. **Data-only protocol** — plugins return JSON trees and emit `{type, payload}`
   actions; they never receive a live host reference.
3. **Capability clamping** — network plugins' declared capabilities are
   intersected with a safe allowlist (feed domain only, no system actions in
   v1). Denied actions are recorded in the action timeline.
4. **Opt-in + content verification** — a network plugin is not loaded until the
   user bookmarks it; its source is fetched and shown for inspection; and the
   fetched value is **verified against the record's ATProto CID** before eval.

## API

| Endpoint | Method | Auth | Purpose |
| --- | --- | --- | --- |
| `/api/posts` | GET | — | recent firehose posts (ring buffer) |
| `/api/status` | GET | — | consumer status + login state |
| `/ws` | GET | — | live post stream (WebSocket) |
| `/api/repo/{describe,records,record}` | GET | — | walk a public repo |
| `/api/plugins/publish` | POST | OAuth | publish a plugin record |
| `/api/plugins/feed` | GET | — | recently-seen plugins (firehose) |
| `/api/plugins/list` | GET | — | list plugins in a repo |
| `/api/plugins/record` | GET | — | fetch a plugin's full source |
| `/oauth/{login,callback,logout}` | GET/POST | — | OAuth DPoP flow |

## Repo layout

```
cmd/
  atproto-demo/      serve + firehose subcommands (glazed/cobra)
  publish-plugin/    publish plugins from a persisted OAuth session
pkg/
  firehose/          subscribeRepos consumer (posts + plugin decode)
  bsky/              account actions
  oauth/             DPoP factory + file-backed ClientAuthStore
  repobrowser/       raw-JSON repo reads (any Lexicon)
  plugins/           dev.atproto-demo.plugin Lexicon + Publish
  server/            net/http ServeMux + ring buffers + routes
frontend/
  src/runtime/        vendored QuickJS plugin VM core
  src/host/           FRP host (usePluginRuntime, PluginSurfaceHost)
  src/ui/             ui.card.v1 renderer
  src/plugins/        manifest, networkLoader, bookmarks, useNetworkFeed
  src/components/     FirehosePlugins, PluginTab, PluginCatalog, ...
  src/features/feed/  feedSlice + feed-middleware pipeline
embed.go             go:embed frontend/dist
```

## Testing

```bash
go build ./... && go vet ./...            # backend
cd frontend && pnpm exec tsc --noEmit     # frontend typecheck
cd frontend && pnpm build                 # frontend build
```

The vendored runtime's full test suite lives in its origin
(`browser-js-inject-vm`, 47 tests). Verification of the end-to-end loop was
done with Playwright against a live relay and real published records.

## Known limitations (v1)

- **Web Publish tab needs an active browser OAuth session.** The standalone
  `publish-plugin` CLI resumes a persisted session and bypasses the cookie, so
  it can publish without a browser.
- **CID verification covers inline-source records.** Records using
  `sourceBlob` (nested CID links) would need `$link` → `CID` conversion before
  encoding; v1 uses inline source, so this does not arise.
- **Feed has no dedup** — each publish creates a new record (new rkey); the feed
  shows all of them.
- **Pipeline runs per firehose tick.** The live firehose (~40 posts/s) feeds a
  60-post cap into the middleware pipeline; a high-volume relay would need
  debouncing.
- **The runtime is a vendored copy** of `browser-js-inject-vm`'s QuickJS VM;
  extracting it into a shared package is a future step.
- **In-memory ring buffers** (200 server-side, 500 client-side); no database.

## Documentation

Design guides and investigation diaries live in `ttmp/`:

- `PLUGIN-SHARING` — the Lexicon, publish path, firehose feed, endpoints
- `PLUGIN-RUNTIME` — network loading, bookmarking, capability clamp, CID verification
- `ATPROTO-DEMO` — the firehose demo + OAuth DPoP
- `REPO-BROWSER` — the repository browser

ATProto specs and indigo reference sources are vendored under `sources/`.

## Tech

Go 1.26 · [glazed](https://github.com/go-go-golems/glazed) · [indigo](https://github.com/bluesky-social/indigo) ·
React 18 · Vite 6 · Redux Toolkit · [quickjs-emscripten](https://github.com/justjake/quickjs-emscripten) ·
multiformats / @ipld/dag-cbor (CID verification)
