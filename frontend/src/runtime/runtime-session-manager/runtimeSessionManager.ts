// Vendored from @go-go-golems/os-scripting/@go-go-golems/os-ui-cards @ a554dc3 (2026-04-06). See src/runtime/VENDORED.md. Do not edit upstream; port fixes here.
import type {
  FeedMiddlewareInput,
  FeedMiddlewareResult,
  IncomingFeedMessageInput,
  IncomingFeedMessageResult,
  RuntimeAction,
  RuntimeBundleMeta,
  RuntimeSurfaceId,
  SessionId,
  StackId,
} from '../plugin-runtime/contracts';
import { QuickJSRuntimeService, type QuickJSRuntimeServiceOptions } from '../plugin-runtime/runtimeService';
import {
  WINDOW_OWNED_RUNTIME_SESSION,
  type RuntimeSessionOwnership,
} from './runtimeOwnership';

export interface EnsureRuntimeSessionRequest {
  bundleId: StackId;
  sessionId: SessionId;
  packageIds: string[];
  bundleCode: string;
}

export interface RuntimeSessionManagerSummary {
  sessionId: SessionId;
  bundleId: StackId;
  packageIds: string[];
  surfaces: string[];
  surfaceTypes?: Record<string, string>;
  title: string;
  description?: string;
  status: 'loading' | 'ready' | 'error';
  error?: string;
  attachedViewIds: string[];
  ownership: RuntimeSessionOwnership;
}

export interface RuntimeSessionManagerHandle {
  readonly sessionId: SessionId;
  readonly bundleId: StackId;
  getBundleMeta(): RuntimeBundleMeta;
  evaluateSessionJs(code: string): ReturnType<QuickJSRuntimeService['evaluateSessionJs']>;
  getSessionGlobalNames(): string[];
  renderSurface(surfaceId: RuntimeSurfaceId, state: unknown): unknown;
  eventSurface(surfaceId: RuntimeSurfaceId, handler: string, args: unknown, state: unknown): RuntimeAction[];
  applyFeedMiddleware(input: FeedMiddlewareInput): FeedMiddlewareResult;
  incomingFeedMessage(input: IncomingFeedMessageInput): IncomingFeedMessageResult;
  defineSurface(surfaceId: RuntimeSurfaceId, code: string, packId: string): RuntimeBundleMeta;
  defineSurfaceRender(surfaceId: RuntimeSurfaceId, code: string): RuntimeBundleMeta;
  defineSurfaceHandler(surfaceId: RuntimeSurfaceId, handler: string, code: string): RuntimeBundleMeta;
  attachView(viewId: string): () => void;
  dispose(): boolean;
}

export interface RuntimeSessionManager {
  ensureSession(request: EnsureRuntimeSessionRequest): Promise<RuntimeSessionManagerHandle>;
  getSession(sessionId: SessionId): RuntimeSessionManagerHandle | null;
  getSummary(sessionId: SessionId): RuntimeSessionManagerSummary | null;
  listSessions(): RuntimeSessionManagerSummary[];
  disposeSession(sessionId: SessionId): boolean;
  clear(): void;
  subscribe(listener: () => void): () => void;
}

interface RuntimeSessionRecord {
  request: EnsureRuntimeSessionRequest;
  status: 'loading' | 'ready' | 'error';
  error?: string;
  bundle: RuntimeBundleMeta | null;
  attachedViewIds: Set<string>;
  pendingLoad: Promise<RuntimeBundleMeta> | null;
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameRequest(left: EnsureRuntimeSessionRequest, right: EnsureRuntimeSessionRequest): boolean {
  return (
    left.bundleId === right.bundleId &&
    left.sessionId === right.sessionId &&
    left.bundleCode === right.bundleCode &&
    arraysEqual(left.packageIds, right.packageIds)
  );
}

function cloneBundleMeta(bundle: RuntimeBundleMeta): RuntimeBundleMeta {
  return {
    ...bundle,
    packageIds: [...bundle.packageIds],
    surfaces: [...bundle.surfaces],
    surfaceTypes: bundle.surfaceTypes ? { ...bundle.surfaceTypes } : undefined,
  };
}

function toSummary(record: RuntimeSessionRecord): RuntimeSessionManagerSummary {
  return {
    sessionId: record.request.sessionId,
    bundleId: record.request.bundleId,
    packageIds: record.bundle?.packageIds ? [...record.bundle.packageIds] : [...record.request.packageIds],
    surfaces: record.bundle?.surfaces ? [...record.bundle.surfaces] : [],
    surfaceTypes: record.bundle?.surfaceTypes ? { ...record.bundle.surfaceTypes } : undefined,
    title: record.bundle?.title ?? record.request.bundleId,
    description: record.bundle?.description,
    status: record.status,
    error: record.error,
    attachedViewIds: Array.from(record.attachedViewIds).sort(),
    ownership: WINDOW_OWNED_RUNTIME_SESSION,
  };
}

export function createRuntimeSessionManager(
  options: QuickJSRuntimeServiceOptions = {},
): RuntimeSessionManager {
  const runtimeService = new QuickJSRuntimeService(options);
  const records = new Map<SessionId, RuntimeSessionRecord>();
  const listeners = new Set<() => void>();

  function emit() {
    listeners.forEach((listener) => listener());
  }

  function getRecordOrThrow(sessionId: SessionId): RuntimeSessionRecord {
    const record = records.get(sessionId);
    if (!record) {
      throw new Error(`Unknown runtime session: ${sessionId}`);
    }
    return record;
  }

  function updateBundle(sessionId: SessionId, bundle: RuntimeBundleMeta): RuntimeBundleMeta {
    const record = getRecordOrThrow(sessionId);
    record.bundle = bundle;
    record.status = 'ready';
    record.error = undefined;
    emit();
    return bundle;
  }

  function attachView(sessionId: SessionId, viewId: string): () => void {
    const record = getRecordOrThrow(sessionId);
    let released = false;
    record.attachedViewIds.add(viewId);
    emit();
    return () => {
      if (released) {
        return;
      }
      released = true;
      const current = records.get(sessionId);
      if (!current) {
        return;
      }
      if (current.attachedViewIds.delete(viewId)) {
        emit();
      }
    };
  }

  function createHandle(sessionId: SessionId): RuntimeSessionManagerHandle {
    return {
      sessionId,
      get bundleId() {
        return getRecordOrThrow(sessionId).request.bundleId;
      },
      getBundleMeta() {
        const record = getRecordOrThrow(sessionId);
        if (!record.bundle) {
          throw new Error(`Runtime session is not ready: ${sessionId}`);
        }
        return cloneBundleMeta(record.bundle);
      },
      evaluateSessionJs(code) {
        return runtimeService.evaluateSessionJs(sessionId, code);
      },
      getSessionGlobalNames() {
        return runtimeService.getSessionGlobalNames(sessionId);
      },
      renderSurface(surfaceId, state) {
        return runtimeService.renderRuntimeSurface(sessionId, surfaceId, state);
      },
      eventSurface(surfaceId, handler, args, state) {
        return runtimeService.eventRuntimeSurface(sessionId, surfaceId, handler, args, state);
      },
      applyFeedMiddleware(input) {
        return runtimeService.applyFeedMiddleware(sessionId, input);
      },
      incomingFeedMessage(input) {
        return runtimeService.incomingFeedMessage(sessionId, input);
      },
      defineSurface(surfaceId, code, packId) {
        return updateBundle(sessionId, runtimeService.defineRuntimeSurface(sessionId, surfaceId, code, packId));
      },
      defineSurfaceRender(surfaceId, code) {
        return updateBundle(sessionId, runtimeService.defineRuntimeSurfaceRender(sessionId, surfaceId, code));
      },
      defineSurfaceHandler(surfaceId, handler, code) {
        return updateBundle(sessionId, runtimeService.defineRuntimeSurfaceHandler(sessionId, surfaceId, handler, code));
      },
      attachView(viewId) {
        return attachView(sessionId, viewId);
      },
      dispose() {
        return manager.disposeSession(sessionId);
      },
    };
  }

  const manager: RuntimeSessionManager = {
    async ensureSession(request) {
      const existing = records.get(request.sessionId);
      if (existing) {
        if (!sameRequest(existing.request, request)) {
          throw new Error(`Runtime session already exists with different configuration: ${request.sessionId}`);
        }
        if (existing.pendingLoad) {
          await existing.pendingLoad;
        }
        if (existing.status === 'error') {
          throw new Error(existing.error ?? `Runtime session failed to load: ${request.sessionId}`);
        }
        return createHandle(request.sessionId);
      }

      const record: RuntimeSessionRecord = {
        request: {
          ...request,
          packageIds: [...request.packageIds],
        },
        status: 'loading',
        bundle: null,
        attachedViewIds: new Set<string>(),
        pendingLoad: null,
      };
      records.set(request.sessionId, record);
      emit();

      record.pendingLoad = runtimeService
        .loadRuntimeBundle(request.bundleId, request.sessionId, request.packageIds, request.bundleCode)
        .then((bundle) => {
          if (records.get(request.sessionId) !== record) {
            runtimeService.disposeSession(request.sessionId);
            return bundle;
          }
          record.bundle = bundle;
          record.status = 'ready';
          record.error = undefined;
          record.pendingLoad = null;
          emit();
          return bundle;
        })
        .catch((error) => {
          if (records.get(request.sessionId) !== record) {
            return Promise.reject(error);
          }
          record.status = 'error';
          record.error = error instanceof Error ? error.message : String(error);
          record.pendingLoad = null;
          emit();
          throw error;
        });

      await record.pendingLoad;
      return createHandle(request.sessionId);
    },
    getSession(sessionId) {
      const record = records.get(sessionId);
      if (!record || record.status !== 'ready') {
        return null;
      }
      return createHandle(sessionId);
    },
    getSummary(sessionId) {
      const record = records.get(sessionId);
      return record ? toSummary(record) : null;
    },
    listSessions() {
      return Array.from(records.values())
        .map((record) => toSummary(record))
        .sort((left, right) => left.sessionId.localeCompare(right.sessionId));
    },
    disposeSession(sessionId) {
      const record = records.get(sessionId);
      if (!record) {
        return false;
      }
      records.delete(sessionId);
      const disposed = runtimeService.disposeSession(sessionId);
      emit();
      return disposed;
    },
    clear() {
      for (const sessionId of Array.from(records.keys())) {
        runtimeService.disposeSession(sessionId);
      }
      records.clear();
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  return manager;
}

export const DEFAULT_RUNTIME_SESSION_MANAGER = createRuntimeSessionManager();
