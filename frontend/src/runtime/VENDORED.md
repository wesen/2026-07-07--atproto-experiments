# Vendored runtime

The files under `src/runtime/` are vendored (copied verbatim) from the
`@go-go-golems/os-scripting` and `@go-go-golems/os-ui-cards` packages in the
**go-go-os-frontend** monorepo.

- **Upstream repo:** `go-go-os-frontend`
- **Upstream commit:** `a554dc3a9506e69b9850900fbb3191ed1a168ed7` (2026-04-06)
- **Upstream paths:**
  - `packages/os-scripting/src/{plugin-runtime,runtime-packages,runtime-packs,runtime-session-manager,features/runtimeSessions}/`
  - `packages/os-ui-cards/src/{uiTypes.ts,runtime-packs/uiSchema.ts}` (UI node type + validator)

## Why vendor (not depend)

`os-scripting` is a workspace package that pulls the full os-frontend desktop
shell (`@go-go-golems/os-core` windowing/nav, `os-chat`, `os-repl`). This repo is
a standalone public webpage and must not require that shell. Vendoring the
self-contained runtime core (sandbox + QuickJS service + Redux reducer +
capability policy) lets us reuse the tested, valuable code without dragging in the
desktop. See the design doc, Decision: dependency strategy.

## What was kept verbatim

- `plugin-runtime/` — contracts, intent schema, QuickJS core, eval bridge,
  session service, runtime service, surface registry, bootstrap kernel.
- `runtime-packages/` — package registry + the `ui` render DSL (`ui.package.vm.js`).
- `runtime-packs/` — surface-type registry (`packId -> {validate, render}`).
- `runtime-session-manager/` — session manager + ownership model.
- `features/runtimeSessions/` — Redux reducer, selectors, capability policy.

## What was NOT vendored (rewritten for this page)

- `runtime-host/RuntimeSurfaceSessionHost.tsx` — deeply coupled to the os-core
  desktop windowing/nav shell. Replaced by `src/host/PluginSurfaceHost.tsx`,
  a purpose-built host implementing the same FRP loop.
- `runtime-host/pluginIntentRouting.ts` — imported `showToast` /
  `sessionNavGo` / `sessionNavBack` / `closeWindow` from os-core. Replaced by
  `src/host/pluginIntentRouting.ts`, which routes system actions to our own
  `toasts` slice and a host-side nav/unmount callback.
- `app/createAppStore.ts` + `runtimeSessionLifecycleMiddleware.ts` — pulled
  os-core perf/debug/windowing reducers. Replaced by `src/host/store.ts`.
- The `ui.card.v1` React renderer (`UIRuntimeRenderer`) used os-core's
  `Btn`/`DropdownMenu`/`SelectableDataTable`/`GridBoard`. Replaced by
  `src/ui/UIRuntimeRenderer.tsx`, a self-contained plain-HTML renderer.

## Sync policy

If os-scripting fixes a sandbox/runtime/reducer bug, port the change here and
bump the commit recorded above. Each vendored file carries a one-line header
pointing back here.
