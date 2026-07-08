// Vendored from @go-go-golems/os-scripting/@go-go-golems/os-ui-cards @ a554dc3 (2026-04-06). See src/runtime/VENDORED.md. Do not edit upstream; port fixes here.
import { createSlice, nanoid, type PayloadAction } from '@reduxjs/toolkit';
import type { RuntimeAction, RuntimeActionKind } from '../../plugin-runtime/contracts';
import {
  authorizeDomainIntent,
  authorizeSystemIntent,
  resolveCapabilityPolicy,
  type CapabilityPolicy,
} from './capabilityPolicy';
import { getRuntimeActionDomain, getRuntimeActionKind, getRuntimeActionOperation } from '../../plugin-runtime/contracts';

export type DispatchOutcome = 'applied' | 'denied' | 'ignored';

export type RuntimeSessionStatus = 'loading' | 'ready' | 'error';

export interface RuntimeTimelineEntry {
  id: string;
  timestamp: string;
  sessionId: string;
  surfaceId: string;
  kind: RuntimeActionKind;
  actionType: string;
  payload?: unknown;
  outcome: DispatchOutcome;
  reason: string | null;
}

export interface DomainIntentEnvelope {
  id: string;
  timestamp: string;
  sessionId: string;
  surfaceId: string;
  domain: string;
  type: string;
  payload?: unknown;
}

export interface SystemIntentEnvelope {
  id: string;
  timestamp: string;
  sessionId: string;
  surfaceId: string;
  type: string;
  payload?: unknown;
}

export interface RuntimeSessionRecord {
  bundleId: string;
  status: RuntimeSessionStatus;
  error: string | null;
  sessionState: Record<string, unknown>;
  surfaceState: Record<string, Record<string, unknown>>;
  pluginState: Record<string, unknown>;
  pluginStateVersion: number;
  capabilities: CapabilityPolicy;
}

export interface RuntimeSessionsState {
  sessions: Record<string, RuntimeSessionRecord>;
  timeline: RuntimeTimelineEntry[];
  pendingDomainIntents: DomainIntentEnvelope[];
  pendingSystemIntents: SystemIntentEnvelope[];
  pendingNavIntents: SystemIntentEnvelope[];
}

export interface RuntimeSessionsStateSlice {
  runtimeSessions: RuntimeSessionsState;
}

interface RegisterSessionPayload {
  sessionId: string;
  bundleId: string;
  initialSessionState?: Record<string, unknown>;
  initialSurfaceState?: Record<string, Record<string, unknown>>;
  initialPluginState?: Record<string, unknown>;
  capabilities?: Partial<CapabilityPolicy>;
  status?: RuntimeSessionStatus;
}

interface RemoveSessionPayload {
  sessionId: string;
}

interface SetSessionStatusPayload {
  sessionId: string;
  status: RuntimeSessionStatus;
  error?: string | null;
}

interface IngestActionPayload {
  id: string;
  timestamp: string;
  sessionId: string;
  surfaceId: string;
  action: RuntimeAction;
}

const MAX_TIMELINE_ENTRIES = 300;

const initialState: RuntimeSessionsState = {
  sessions: {},
  timeline: [],
  pendingDomainIntents: [],
  pendingSystemIntents: [],
  pendingNavIntents: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepSet(target: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split('.').filter(Boolean);
  if (keys.length === 0) return;

  let current: Record<string, unknown> = target;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    const nextValue = current[key];
    if (!isRecord(nextValue)) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  current[keys[keys.length - 1]] = value;
}

function clearObject(target: Record<string, unknown>) {
  for (const key of Object.keys(target)) {
    delete target[key];
  }
}

function shallowObjectChanged(target: Record<string, unknown>, patch: Record<string, unknown>): boolean {
  return Object.entries(patch).some(([key, value]) => target[key] !== value);
}

function applyLocalStateAction(
  target: Record<string, unknown>,
  operation: string,
  payload: unknown
): { outcome: DispatchOutcome; reason: string | null } {
  if (operation === 'patch') {
    if (!isRecord(payload)) {
      return { outcome: 'ignored', reason: 'patch_requires_object_payload' };
    }

    Object.assign(target, payload);
    return { outcome: 'applied', reason: null };
  }

  if (operation === 'set') {
    if (!isRecord(payload) || typeof payload.path !== 'string') {
      return { outcome: 'ignored', reason: 'set_requires_{path,value}_payload' };
    }

    deepSet(target, payload.path, payload.value);
    return { outcome: 'applied', reason: null };
  }

  if (operation === 'reset') {
    clearObject(target);
    return { outcome: 'applied', reason: null };
  }

  return { outcome: 'ignored', reason: `unsupported_local_action:${operation}` };
}

function applyPluginStateAction(
  target: Record<string, unknown>,
  operation: string,
  payload: unknown,
): { outcome: DispatchOutcome; reason: string | null; changed: boolean } {
  if (operation === 'state.merge') {
    if (!isRecord(payload)) {
      return { outcome: 'ignored', reason: 'state.merge_requires_object_payload', changed: false };
    }
    const changed = shallowObjectChanged(target, payload);
    if (changed) {
      Object.assign(target, payload);
    }
    return { outcome: 'applied', reason: null, changed };
  }

  if (operation === 'state.replace') {
    const next = isRecord(payload) ? payload : {};
    const changed =
      Object.keys(target).length !== Object.keys(next).length ||
      Object.entries(next).some(([key, value]) => target[key] !== value);
    if (changed) {
      clearObject(target);
      Object.assign(target, next);
    }
    return { outcome: 'applied', reason: null, changed };
  }

  if (operation === 'state.set') {
    if (!isRecord(payload) || typeof payload.path !== 'string') {
      return { outcome: 'ignored', reason: 'state.set_requires_{path,value}_payload', changed: false };
    }
    const keys = payload.path.split('.').filter(Boolean);
    if (keys.length === 0) {
      return { outcome: 'ignored', reason: 'state.set_requires_non_empty_path', changed: false };
    }
    let current: Record<string, unknown> = target;
    for (let index = 0; index < keys.length - 1; index += 1) {
      const key = keys[index];
      const nextValue = current[key];
      if (!isRecord(nextValue)) {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }
    const finalKey = keys[keys.length - 1];
    const changed = current[finalKey] !== payload.value;
    if (changed) {
      current[finalKey] = payload.value;
    }
    return { outcome: 'applied', reason: null, changed };
  }

  if (operation === 'invalidate') {
    return { outcome: 'applied', reason: null, changed: true };
  }

  return { outcome: 'ignored', reason: `unsupported_plugin_action:${operation}`, changed: false };
}

function appendTimeline(
  state: RuntimeSessionsState,
  payload: IngestActionPayload,
  kind: RuntimeActionKind,
  outcome: DispatchOutcome,
  reason: string | null
) {
  state.timeline.push({
    id: payload.id,
    timestamp: payload.timestamp,
    sessionId: payload.sessionId,
    surfaceId: payload.surfaceId,
    kind,
    actionType: payload.action.type,
    payload: payload.action.payload,
    outcome,
    reason,
  });

  if (state.timeline.length > MAX_TIMELINE_ENTRIES) {
    state.timeline.splice(0, state.timeline.length - MAX_TIMELINE_ENTRIES);
  }
}

const runtimeSessionsSlice = createSlice({
  name: 'runtimeSessions',
  initialState,
  reducers: {
    registerRuntimeSession(state, action: PayloadAction<RegisterSessionPayload>) {
      const payload = action.payload;

      state.sessions[payload.sessionId] = {
        bundleId: payload.bundleId,
        status: payload.status ?? 'loading',
        error: null,
        sessionState: payload.initialSessionState ? { ...payload.initialSessionState } : {},
        surfaceState: payload.initialSurfaceState ? { ...payload.initialSurfaceState } : {},
        pluginState: payload.initialPluginState ? { ...payload.initialPluginState } : {},
        pluginStateVersion: payload.initialPluginState ? 1 : 0,
        capabilities: resolveCapabilityPolicy(payload.capabilities),
      };
    },

    removeRuntimeSession(state, action: PayloadAction<RemoveSessionPayload>) {
      const { sessionId } = action.payload;
      delete state.sessions[sessionId];

      state.pendingDomainIntents = state.pendingDomainIntents.filter((intent) => intent.sessionId !== sessionId);
      state.pendingSystemIntents = state.pendingSystemIntents.filter((intent) => intent.sessionId !== sessionId);
      state.pendingNavIntents = state.pendingNavIntents.filter((intent) => intent.sessionId !== sessionId);
    },

    setRuntimeSessionStatus(state, action: PayloadAction<SetSessionStatusPayload>) {
      const session = state.sessions[action.payload.sessionId];
      if (!session) {
        return;
      }

      session.status = action.payload.status;
      session.error = action.payload.error ?? null;
    },

    ingestRuntimeAction: {
      reducer(state, action: PayloadAction<IngestActionPayload>) {
        const payload = action.payload;
        const session = state.sessions[payload.sessionId];
        if (!session) {
          appendTimeline(state, payload, 'unknown', 'denied', `missing_session:${payload.sessionId}`);
          return;
        }

        const kind = getRuntimeActionKind(payload.action.type);

        if (kind === 'draft') {
          if (!session.surfaceState[payload.surfaceId]) {
            session.surfaceState[payload.surfaceId] = {};
          }

          const result = applyLocalStateAction(
            session.surfaceState[payload.surfaceId],
            getRuntimeActionOperation(payload.action.type),
            payload.action.payload,
          );
          appendTimeline(state, payload, kind, result.outcome, result.reason);
          return;
        }

        if (kind === 'filters') {
          const result = applyLocalStateAction(
            session.sessionState,
            getRuntimeActionOperation(payload.action.type),
            payload.action.payload,
          );
          appendTimeline(state, payload, kind, result.outcome, result.reason);
          return;
        }

        if (kind === 'plugin') {
          const result = applyPluginStateAction(
            session.pluginState,
            getRuntimeActionOperation(payload.action.type),
            payload.action.payload,
          );
          if (result.changed) {
            session.pluginStateVersion += 1;
          }
          appendTimeline(state, payload, kind, result.outcome, result.reason);
          return;
        }

        if (kind === 'domain') {
          const domain = getRuntimeActionDomain(payload.action.type);
          if (!domain) {
            appendTimeline(state, payload, kind, 'ignored', `missing_domain_prefix:${payload.action.type}`);
            return;
          }

          const decision = authorizeDomainIntent(session.capabilities, domain);
          if (!decision.allowed) {
            appendTimeline(state, payload, kind, 'denied', decision.reason);
            return;
          }

          state.pendingDomainIntents.push({
            id: payload.id,
            timestamp: payload.timestamp,
            sessionId: payload.sessionId,
            surfaceId: payload.surfaceId,
            domain,
            type: payload.action.type,
            payload: payload.action.payload,
          });
          appendTimeline(state, payload, kind, 'applied', null);
          return;
        }

        if (kind === 'system') {
          const decision = authorizeSystemIntent(session.capabilities, payload.action.type);
          if (!decision.allowed) {
            appendTimeline(state, payload, kind, 'denied', decision.reason);
            return;
          }

          const queued: SystemIntentEnvelope = {
            id: payload.id,
            timestamp: payload.timestamp,
            sessionId: payload.sessionId,
            surfaceId: payload.surfaceId,
            type: payload.action.type,
            payload: payload.action.payload,
          };

          state.pendingSystemIntents.push(queued);
          if (payload.action.type.startsWith('nav.')) {
            state.pendingNavIntents.push(queued);
          }

          appendTimeline(state, payload, kind, 'applied', null);
          return;
        }

        appendTimeline(state, payload, kind, 'ignored', `unsupported_action_type:${payload.action.type}`);
      },
      prepare(payload: Omit<IngestActionPayload, 'id' | 'timestamp'> & { timestamp?: string }) {
        return {
          payload: {
            ...payload,
            id: nanoid(),
            timestamp: payload.timestamp ?? new Date().toISOString(),
          },
        };
      },
    },

    dequeuePendingDomainIntent(state, action: PayloadAction<{ id?: string } | undefined>) {
      const id = action.payload?.id;
      if (!id) {
        state.pendingDomainIntents.shift();
        return;
      }

      state.pendingDomainIntents = state.pendingDomainIntents.filter((intent) => intent.id !== id);
    },

    dequeuePendingSystemIntent(state, action: PayloadAction<{ id?: string } | undefined>) {
      const id = action.payload?.id;
      if (!id) {
        state.pendingSystemIntents.shift();
        return;
      }

      state.pendingSystemIntents = state.pendingSystemIntents.filter((intent) => intent.id !== id);
    },

    dequeuePendingNavIntent(state, action: PayloadAction<{ id?: string } | undefined>) {
      const id = action.payload?.id;
      if (!id) {
        state.pendingNavIntents.shift();
        return;
      }

      state.pendingNavIntents = state.pendingNavIntents.filter((intent) => intent.id !== id);
    },

    clearRuntimeTimeline(state) {
      state.timeline = [];
    },
  },
});

export const {
  clearRuntimeTimeline,
  dequeuePendingDomainIntent,
  dequeuePendingNavIntent,
  dequeuePendingSystemIntent,
  ingestRuntimeAction,
  registerRuntimeSession,
  removeRuntimeSession,
  setRuntimeSessionStatus,
} = runtimeSessionsSlice.actions;

export const runtimeSessionsReducer = runtimeSessionsSlice.reducer;
