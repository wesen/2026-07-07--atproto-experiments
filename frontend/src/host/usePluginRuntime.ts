// usePluginRuntime — the FRP loop extracted as a hook, shared by the fullpage
// host (PluginSurfaceHost) and the panel host (PluginPanelHost).
//
// Owns, for one plugin session:
//   - Redux session registration (loading -> ready/error)
//   - VM session ensure + initial-state seeding
//   - VM teardown on unmount
//   - a surface nav stack (nav.go pushes, nav.back pops; root back -> onClose)
//   - projectState() (the state handed to the sandbox)
//   - render memo (sandbox.render -> validated tree)
//   - emitRuntimeEvent (sandbox.event -> dispatchRuntimeAction)
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { shallowEqual, useDispatch, useSelector, useStore } from 'react-redux';
import type { AppDispatch, RootState } from './store';
import { addToast } from './toastsSlice';
import { dispatchRuntimeAction, type ActionDispatchContext } from './pluginIntentRouting';
import {
  registerRuntimeSession,
  removeRuntimeSession,
  setRuntimeSessionStatus,
  selectRuntimeSession,
  selectRuntimeSessionState,
  selectRuntimeSurfaceState,
  selectRuntimePluginState,
  selectProjectedRuntimeDomains,
} from '../runtime/features/runtimeSessions';
import { DEFAULT_RUNTIME_SESSION_MANAGER } from '../runtime/runtime-session-manager';
import { validateRuntimeSurfaceTree } from '../runtime/runtime-packs';
import type { RuntimeAction, RuntimeBundleMeta } from '../runtime/plugin-runtime/contracts';
import type { PluginManifestEntry } from '../plugins/manifest';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface UsePluginRuntimeArgs {
  plugin: PluginManifestEntry;
  sessionId: string;
  windowId: string;
  onClose: () => void;
}

export interface UsePluginRuntimeResult {
  status: 'missing' | 'loading' | 'ready' | 'error';
  error: string | null;
  currentSurfaceId: string;
  canGoBack: boolean;
  goBack: () => void;
  tree: unknown | null;
  packId: string | null;
  renderError: string | null;
  emitRuntimeEvent: (handler: string, args?: unknown) => void;
}

export function usePluginRuntime({ plugin, sessionId, windowId, onClose }: UsePluginRuntimeArgs): UsePluginRuntimeResult {
  const dispatch = useDispatch<AppDispatch>();
  const store = useStore<RootState>();

  const [surfaceStack, setSurfaceStack] = useState<string[]>([plugin.homeSurface]);
  const currentSurfaceId = surfaceStack[surfaceStack.length - 1];

  const runtimeSession = useSelector((s: RootState) => selectRuntimeSession(s, sessionId));
  const sessionState = useSelector((s: RootState) => selectRuntimeSessionState(s, sessionId));
  const surfaceState = useSelector((s: RootState) => selectRuntimeSurfaceState(s, sessionId, currentSurfaceId));
  const pluginState = useSelector((s: RootState) => selectRuntimePluginState(s, sessionId));
  const projectedDomains = useSelector(
    (s: RootState) => selectProjectedRuntimeDomains(s, runtimeSession?.capabilities.domain ?? []),
    shallowEqual,
  );

  const loadedBundleRef = useRef<RuntimeBundleMeta | null>(null);
  const localRuntimeReady = DEFAULT_RUNTIME_SESSION_MANAGER.getSession(sessionId) !== null;

  // 1. Register a 'loading' session in Redux if none exists.
  useEffect(() => {
    if (runtimeSession) {
      return;
    }
    dispatch(
      registerRuntimeSession({
        sessionId,
        bundleId: plugin.id,
        status: 'loading',
        capabilities: plugin.capabilities,
      }),
    );
  }, [dispatch, runtimeSession, sessionId, plugin.id, plugin.capabilities]);

  // 2. Ensure the VM session, then flip to 'ready' and seed initial state.
  useEffect(() => {
    if (!runtimeSession) {
      return;
    }
    const needsLoad = runtimeSession.status === 'loading' || (runtimeSession.status === 'ready' && !localRuntimeReady);
    if (!needsLoad) {
      return;
    }
    let cancelled = false;

    async function load() {
      try {
        const handle = await DEFAULT_RUNTIME_SESSION_MANAGER.ensureSession({
          bundleId: plugin.id,
          sessionId,
          packageIds: plugin.packageIds,
          bundleCode: plugin.bundleCode,
        });
        if (cancelled) {
          return;
        }
        const meta = handle.getBundleMeta();
        loadedBundleRef.current = meta;
        dispatch(setRuntimeSessionStatus({ sessionId, status: 'ready' }));

        const baseCtx: ActionDispatchContext = {
          dispatch: (action) => dispatch(action as never),
          getState: () => store.getState(),
          sessionId,
          surfaceId: currentSurfaceId,
          windowId,
          onNavGo: () => {},
          onNavBack: () => {},
          onClose,
        };

        if (meta.initialPluginState && typeof meta.initialPluginState === 'object') {
          dispatchRuntimeAction({ type: 'plugin/state.replace', payload: meta.initialPluginState }, baseCtx);
        }
        if (meta.initialSessionState && typeof meta.initialSessionState === 'object') {
          dispatchRuntimeAction({ type: 'filters.patch', payload: meta.initialSessionState }, baseCtx);
        }
        if (meta.initialSurfaceState && typeof meta.initialSurfaceState === 'object') {
          for (const [surfaceId, value] of Object.entries(meta.initialSurfaceState)) {
            if (isRecord(value)) {
              dispatchRuntimeAction({ type: 'draft.patch', payload: value }, { ...baseCtx, surfaceId });
            }
          }
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        loadedBundleRef.current = null;
        dispatch(setRuntimeSessionStatus({ sessionId, status: 'error', error: message }));
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [plugin.id, plugin.packageIds, plugin.bundleCode, runtimeSession, localRuntimeReady, sessionId, currentSurfaceId, windowId, dispatch, store, onClose]);

  // 3. Teardown on unmount.
  useEffect(() => {
    return () => {
      DEFAULT_RUNTIME_SESSION_MANAGER.disposeSession(sessionId);
      dispatch(removeRuntimeSession({ sessionId }));
      loadedBundleRef.current = null;
    };
  }, [sessionId, dispatch]);

  const projectState = useCallback(
    () => ({
      self: { bundleId: plugin.id, sessionId, surfaceId: currentSurfaceId, windowId },
      nav: {
        current: currentSurfaceId,
        param: undefined,
        depth: surfaceStack.length,
        canBack: surfaceStack.length > 1,
      },
      ui: { focusedWindowId: null, runtimeStatus: runtimeSession?.status ?? 'missing' },
      filters: sessionState,
      draft: surfaceState,
      plugin: pluginState,
      ...projectedDomains,
    }),
    [plugin.id, sessionId, currentSurfaceId, windowId, surfaceStack.length, runtimeSession?.status, sessionState, surfaceState, pluginState, projectedDomains],
  );

  const renderOutcome = useMemo<{ tree: unknown | null; packId: string | null; error: string | null }>(() => {
    if (!runtimeSession || runtimeSession.status !== 'ready' || !localRuntimeReady) {
      return { tree: null, packId: null, error: null };
    }
    const handle = DEFAULT_RUNTIME_SESSION_MANAGER.getSession(sessionId);
    if (!handle) {
      return { tree: null, packId: null, error: null };
    }
    try {
      const state = projectState();
      const rawTree = handle.renderSurface(currentSurfaceId, state);
      const meta = loadedBundleRef.current ?? handle.getBundleMeta();
      const packId = meta.surfaceTypes?.[currentSurfaceId] ?? null;
      if (!packId) {
        return { tree: null, packId: null, error: `No surface type registered for '${currentSurfaceId}'` };
      }
      return {
        tree: rawTree == null ? null : validateRuntimeSurfaceTree(packId, rawTree),
        packId,
        error: null,
      };
    } catch (error) {
      return { tree: null, packId: null, error: error instanceof Error ? error.message : String(error) };
    }
  }, [currentSurfaceId, localRuntimeReady, projectState, runtimeSession, sessionId]);

  const emitRuntimeEvent = useCallback(
    (handler: string, args?: unknown) => {
      if (!runtimeSession || runtimeSession.status !== 'ready' || !localRuntimeReady) {
        return;
      }
      const handle = DEFAULT_RUNTIME_SESSION_MANAGER.getSession(sessionId);
      if (!handle) {
        return;
      }
      let actions: RuntimeAction[];
      try {
        actions = handle.eventSurface(currentSurfaceId, handler, args, projectState()) ?? [];
      } catch (error) {
        dispatch(addToast(error instanceof Error ? error.message : String(error), 'error'));
        return;
      }
      const ctx: ActionDispatchContext = {
        dispatch: (action) => dispatch(action as never),
        getState: () => store.getState(),
        sessionId,
        surfaceId: currentSurfaceId,
        windowId,
        onNavGo: ({ surfaceId }) => setSurfaceStack((stack) => [...stack, surfaceId]),
        onNavBack: () => {
          if (surfaceStack.length > 1) {
            setSurfaceStack(surfaceStack.slice(0, -1));
          } else {
            onClose();
          }
        },
        onClose,
      };
      for (const action of actions) {
        dispatchRuntimeAction(action, ctx);
      }
    },
    [currentSurfaceId, dispatch, localRuntimeReady, onClose, projectState, runtimeSession, sessionId, store, surfaceStack.length, windowId],
  );

  const goBack = useCallback(() => {
    if (surfaceStack.length > 1) {
      setSurfaceStack(surfaceStack.slice(0, -1));
    } else {
      onClose();
    }
  }, [surfaceStack.length, onClose]);

  return {
    status: runtimeSession?.status ?? 'missing',
    error: runtimeSession?.error ?? null,
    currentSurfaceId,
    canGoBack: surfaceStack.length > 1,
    goBack,
    tree: renderOutcome.tree,
    packId: renderOutcome.packId,
    renderError: renderOutcome.error,
    emitRuntimeEvent,
  };
}
