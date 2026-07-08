// Vendored from @go-go-golems/os-scripting/@go-go-golems/os-ui-cards @ a554dc3 (2026-04-06). See src/runtime/VENDORED.md. Do not edit upstream; port fixes here.
/**
 * Global registry of runtime surface definitions that need to be injected
 * into runtime sessions after bundle loading.
 *
 * Flow:
 * 1. Chat receives card.v2 event → calls registerRuntimeSurface(surfaceId, code, packId)
 * 2. RuntimeSurfaceSessionHost finishes loadRuntimeBundle → calls injectPendingRuntimeSurfaces(service, sessionId)
 * 3. injectPendingRuntimeSurfaces iterates the registry, calls service.defineRuntimeSurface() for each
 */

export interface RuntimeSurfaceDefinition {
  surfaceId: string;
  code: string;
  packId: string;
  registeredAt: number;
}

export interface RuntimeSurfaceInjectionFailure {
  surfaceId: string;
  error: string;
}

export interface RuntimeSurfaceInjectionResult {
  injected: string[];
  failed: RuntimeSurfaceInjectionFailure[];
}

const registry = new Map<string, RuntimeSurfaceDefinition>();
const listeners = new Set<() => void>();

/** Register a runtime surface definition for injection into future sessions. */
export function registerRuntimeSurface(surfaceId: string, code: string, packId: string): void {
  const normalizedPackId = typeof packId === 'string' ? packId.trim() : '';
  if (!normalizedPackId) {
    throw new Error(`runtime surface packId is required for ${surfaceId}`);
  }
  registry.set(surfaceId, {
    surfaceId,
    code,
    packId: normalizedPackId,
    registeredAt: Date.now(),
  });
  listeners.forEach((fn) => fn());
}

/** Remove a runtime surface definition. */
export function unregisterRuntimeSurface(surfaceId: string): void {
  registry.delete(surfaceId);
  listeners.forEach((fn) => fn());
}

/** Get all pending runtime surface definitions. */
export function getPendingRuntimeSurfaces(): RuntimeSurfaceDefinition[] {
  return Array.from(registry.values());
}

/** Check if a specific runtime surface is registered. */
export function hasRuntimeSurface(surfaceId: string): boolean {
  return registry.has(surfaceId);
}

/** Subscribe to registry changes. Returns unsubscribe function. */
export function onRegistryChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Clear all registered runtime surfaces (for testing). */
export function clearRuntimeSurfaceRegistry(): void {
  registry.clear();
  listeners.forEach((fn) => fn());
}

/**
 * Inject all pending runtime surfaces into a session.
 * Returns the list of surface IDs that were successfully injected.
 */
export function injectPendingRuntimeSurfaces(
  service: { defineRuntimeSurface(sessionId: string, surfaceId: string, code: string, packId: string): unknown },
  sessionId: string,
): string[] {
  return injectPendingRuntimeSurfacesWithReport(service, sessionId).injected;
}

export function injectPendingRuntimeSurfacesWithReport(
  service: { defineRuntimeSurface(sessionId: string, surfaceId: string, code: string, packId: string): unknown },
  sessionId: string,
): RuntimeSurfaceInjectionResult {
  const injected: string[] = [];
  const failed: RuntimeSurfaceInjectionFailure[] = [];
  for (const def of registry.values()) {
    try {
      service.defineRuntimeSurface(sessionId, def.surfaceId, def.code, def.packId);
      injected.push(def.surfaceId);
    } catch (err) {
      console.error(`[runtimeSurfaceRegistry] Failed to inject runtime surface ${def.surfaceId} into ${sessionId}:`, err);
      failed.push({
        surfaceId: def.surfaceId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { injected, failed };
}
