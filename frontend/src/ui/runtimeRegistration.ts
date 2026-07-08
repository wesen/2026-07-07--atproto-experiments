// Host-side registration of the `ui` runtime package and the `ui.card.v1`
// surface type. Equivalent to os-ui-cards' runtimeRegistration, but local.
//
// - `registerRuntimePackage` makes `getRuntimePackageOrThrow('ui')` resolve
//   during bundle load, and `installPrelude` (the ui.package.vm.js source) is
//   eval'd into the sandbox so plugins receive `globalThis.ui`.
// - `registerRuntimeSurfaceType` makes `renderRuntimeSurfaceTree('ui.card.v1', ...)`
//   validate + render the tree.
import type { RuntimePackageDefinition } from '../runtime/runtime-packages';
import { registerRuntimePackage } from '../runtime/runtime-packages';
import { registerRuntimeSurfaceType } from '../runtime/runtime-packs';
import uiPackagePrelude from '../runtime/runtime-packages/ui.package.vm.js?raw';
import { UI_CARD_V1_RUNTIME_SURFACE_TYPE } from './uiCardV1Pack';

export const UI_RUNTIME_PACKAGE: RuntimePackageDefinition = {
  packageId: 'ui',
  version: '1.0.0',
  summary: 'Base UI DSL package providing ui.* node constructors.',
  installPrelude: uiPackagePrelude,
  surfaceTypes: ['ui.card.v1'],
};

let registered = false;

/** Idempotently register the `ui` package + `ui.card.v1` surface type. */
export function registerUiRuntime(): void {
  if (registered) {
    return;
  }
  registerRuntimePackage(UI_RUNTIME_PACKAGE);
  registerRuntimeSurfaceType(UI_CARD_V1_RUNTIME_SURFACE_TYPE);
  registered = true;
}
