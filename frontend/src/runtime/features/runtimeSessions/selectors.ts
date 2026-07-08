// Vendored from @go-go-golems/os-scripting/@go-go-golems/os-ui-cards @ a554dc3 (2026-04-06). See src/runtime/VENDORED.md. Do not edit upstream; port fixes here.
import type { CapabilitySet } from './capabilityPolicy';
import type {
  RuntimeSessionsState,
  RuntimeSessionsStateSlice,
  RuntimeSessionRecord,
} from './runtimeSessionsSlice';

const EMPTY_RUNTIME_OBJECT = Object.freeze({}) as Record<string, unknown>;
const projectedDomainsCache = new WeakMap<object, Map<string, Record<string, unknown>>>();
const ALL_PROJECTED_DOMAINS_CACHE_KEY = '__all__';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const selectRuntimeSessionsState = (state: RuntimeSessionsStateSlice): RuntimeSessionsState =>
  state.runtimeSessions;

export const selectRuntimeSession = (
  state: RuntimeSessionsStateSlice,
  sessionId: string
): RuntimeSessionRecord | undefined => state.runtimeSessions.sessions[sessionId];

export const selectRuntimeSessionState = (
  state: RuntimeSessionsStateSlice,
  sessionId: string
): Record<string, unknown> => state.runtimeSessions.sessions[sessionId]?.sessionState ?? EMPTY_RUNTIME_OBJECT;

export const selectRuntimePluginState = (
  state: RuntimeSessionsStateSlice,
  sessionId: string
): Record<string, unknown> => state.runtimeSessions.sessions[sessionId]?.pluginState ?? EMPTY_RUNTIME_OBJECT;

export const selectRuntimePluginStateVersion = (
  state: RuntimeSessionsStateSlice,
  sessionId: string
): number => state.runtimeSessions.sessions[sessionId]?.pluginStateVersion ?? 0;

export const selectRuntimePluginStates = (
  state: RuntimeSessionsStateSlice,
  sessionIds: string[],
): Record<string, Record<string, unknown>> => Object.fromEntries(
  sessionIds.map((sessionId) => [sessionId, selectRuntimePluginState(state, sessionId)]),
);

export const selectRuntimeSurfaceState = (
  state: RuntimeSessionsStateSlice,
  sessionId: string,
  surfaceId: string
): Record<string, unknown> => state.runtimeSessions.sessions[sessionId]?.surfaceState[surfaceId] ?? EMPTY_RUNTIME_OBJECT;

export const selectRuntimeTimeline = (state: RuntimeSessionsStateSlice) => state.runtimeSessions.timeline;

export const selectPendingDomainIntents = (state: RuntimeSessionsStateSlice) =>
  state.runtimeSessions.pendingDomainIntents;

export const selectPendingSystemIntents = (state: RuntimeSessionsStateSlice) =>
  state.runtimeSessions.pendingSystemIntents;

export const selectPendingNavIntents = (state: RuntimeSessionsStateSlice) =>
  state.runtimeSessions.pendingNavIntents;

/**
 * Returns the app slices that the runtime host currently projects into VM-facing state.
 * The result is intended to be consumed with `useSelector(..., shallowEqual)` so callers
 * rerender only when relevant slice references change.
 */
export const selectProjectedRuntimeDomains = (
  state: unknown,
  allowedSlices: CapabilitySet = [],
): Record<string, unknown> => {
  if (!isRecord(state)) {
    return EMPTY_RUNTIME_OBJECT;
  }

  if (Array.isArray(allowedSlices) && allowedSlices.length === 0) {
    return EMPTY_RUNTIME_OBJECT;
  }

  const cacheKey = allowedSlices === 'all' ? ALL_PROJECTED_DOMAINS_CACHE_KEY : allowedSlices.join('\u0000');
  const cachedByState = projectedDomainsCache.get(state);
  const cached = cachedByState?.get(cacheKey);
  if (cached) {
    return cached;
  }

  const projected = Object.fromEntries(
    (allowedSlices === 'all' ? Object.keys(state) : allowedSlices)
      .filter((key) => isRecord(state[key]))
      .map((key) => [key, state[key]]),
  );
  const nextCache = cachedByState ?? new Map<string, Record<string, unknown>>();
  nextCache.set(cacheKey, projected);
  projectedDomainsCache.set(state, nextCache);
  return projected;
};
