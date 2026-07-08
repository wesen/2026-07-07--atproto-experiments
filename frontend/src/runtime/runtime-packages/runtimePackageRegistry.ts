// Vendored from @go-go-golems/os-scripting/@go-go-golems/os-ui-cards @ a554dc3 (2026-04-06). See src/runtime/VENDORED.md. Do not edit upstream; port fixes here.
export interface RuntimePackageDefinition {
  packageId: string;
  version: string;
  summary?: string;
  docsMetadata?: Record<string, unknown>;
  installPrelude: string;
  surfaceTypes: string[];
  dependencies?: string[];
}

const runtimePackages = new Map<string, RuntimePackageDefinition>();

export function registerRuntimePackage(definition: RuntimePackageDefinition): void {
  runtimePackages.set(definition.packageId, definition);
}

export function clearRuntimePackages(): void {
  runtimePackages.clear();
}

export function getRuntimePackageOrThrow(packageId: string): RuntimePackageDefinition {
  const runtimePackage = runtimePackages.get(packageId);
  if (!runtimePackage) {
    throw new Error(`Unknown runtime package: ${packageId}`);
  }
  return runtimePackage;
}

export function listRuntimePackages(): string[] {
  return Array.from(runtimePackages.keys()).sort();
}

export function resolveRuntimePackageInstallOrder(packageIds: string[]): string[] {
  const ordered: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(packageId: string) {
    if (visited.has(packageId)) {
      return;
    }
    if (visiting.has(packageId)) {
      throw new Error(`Runtime package dependency cycle detected at ${packageId}`);
    }

    visiting.add(packageId);
    const runtimePackage = getRuntimePackageOrThrow(packageId);
    for (const dependencyId of runtimePackage.dependencies ?? []) {
      visit(dependencyId);
    }
    visiting.delete(packageId);
    visited.add(packageId);
    ordered.push(packageId);
  }

  for (const packageId of packageIds) {
    visit(packageId);
  }

  return ordered;
}
