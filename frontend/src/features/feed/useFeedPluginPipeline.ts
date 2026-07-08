import { useEffect, useMemo, useState } from 'react';
import { shallowEqual, useDispatch, useSelector, useStore } from 'react-redux';
import { DEFAULT_RUNTIME_SESSION_MANAGER } from '../../runtime/runtime-session-manager';
import {
  selectRuntimePluginState,
  selectRuntimePluginStateVersion,
  selectRuntimeSession,
} from '../../runtime/features/runtimeSessions';
import { dispatchRuntimeAction, type ActionDispatchContext } from '../../host/pluginIntentRouting';
import type { AppDispatch, RootState } from '../../host/store';
import type { FeedPost, RuntimeAction } from '../../runtime/plugin-runtime/contracts';
import {
  applyFeedMiddlewareResult,
  buildFeedHookContext,
  emptyPipelineOutput,
  mergeAnnotations,
  type ActiveFeedPluginSession,
  type FeedPipelineOutput,
  type HookEffect,
} from './feedPluginPipeline';

function dispatchHookAction(
  dispatch: AppDispatch,
  getState: () => RootState,
  plugin: { sessionId: string },
  action: RuntimeAction,
) {
  const ctx: ActionDispatchContext = {
    dispatch: (a) => dispatch(a as never),
    getState,
    sessionId: plugin.sessionId,
    surfaceId: 'feed-hook',
    windowId: plugin.sessionId,
    onNavGo: () => {},
    onNavBack: () => {},
    onClose: () => {},
  };
  dispatchRuntimeAction(action, ctx);
}

export function dispatchHookEffects(
  dispatch: AppDispatch,
  getState: () => RootState,
  effects: HookEffect[],
) {
  for (const effect of effects) {
    dispatchHookAction(dispatch, getState, effect, effect.action);
  }
}

export function useFeedPluginPipeline(active: ActiveFeedPluginSession[], posts: FeedPost[]): FeedPipelineOutput {
  const dispatch = useDispatch<AppDispatch>();
  const store = useStore<RootState>();
  const [output, setOutput] = useState<FeedPipelineOutput>(() => emptyPipelineOutput(posts));

  const activeKey = useMemo(() => active.map((entry) => `${entry.id}:${entry.sessionId}`).join('|'), [active]);
  const pluginStates = useSelector(
    (s: RootState) => Object.fromEntries(active.map((entry) => [entry.sessionId, selectRuntimePluginState(s, entry.sessionId)])),
    shallowEqual,
  );
  const pluginVersions = useSelector(
    (s: RootState) => Object.fromEntries(active.map((entry) => [entry.sessionId, selectRuntimePluginStateVersion(s, entry.sessionId)])),
    shallowEqual,
  );
  const readyKey = useSelector(
    (s: RootState) => active.map((entry) => `${entry.sessionId}:${selectRuntimeSession(s, entry.sessionId)?.status ?? 'missing'}`).join('|'),
  );

  useEffect(() => {
    let cancelled = false;
    let current = posts;
    const annotations: Record<string, Record<string, unknown>> = {};
    const trace: FeedPipelineOutput['trace'] = [];
    const errors: string[] = [];
    const effects: HookEffect[] = [];

    for (const plugin of active) {
      const handle = DEFAULT_RUNTIME_SESSION_MANAGER.getSession(plugin.sessionId);
      const meta = handle?.getBundleMeta();
      if (!handle || meta?.hooks?.feedMiddleware !== true) {
        continue;
      }
      const started = performance.now();
      try {
        const result = handle.applyFeedMiddleware({
          posts: current,
          allPosts: posts,
          pluginState: pluginStates[plugin.sessionId] ?? {},
          context: buildFeedHookContext(plugin, posts, 'feed-changed'),
        });
        const step = applyFeedMiddlewareResult(plugin, current, result, performance.now() - started);
        current = step.posts;
        mergeAnnotations(annotations, step.annotations);
        trace.push(step.trace);
        effects.push(...step.effects);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${plugin.id}: ${message}`);
        trace.push({
          pluginId: plugin.id,
          sessionId: plugin.sessionId,
          hook: 'apply',
          before: current.length,
          after: current.length,
          hidden: 0,
          durationMs: performance.now() - started,
          error: message,
        });
      }
    }

    dispatchHookEffects(dispatch, () => store.getState(), effects);
    if (!cancelled) {
      setOutput({ visiblePosts: current, annotations, trace, errors });
    }
    return () => {
      cancelled = true;
    };
  }, [active, activeKey, dispatch, pluginStates, pluginVersions, posts, readyKey, store]);

  return output;
}
