// Adapted from os-scripting runtime-host/pluginIntentRouting.ts.
//
// Difference: the original imported showToast / sessionNavGo / sessionNavBack /
// closeWindow from @go-go-golems/os-core (the desktop shell). This page has no
// desktop shell, so system actions are routed to our own toasts slice and to
// host-supplied nav/close callbacks. The capability-gating logic is identical.
import { addToast } from './toastsSlice';
import {
  authorizeDomainIntent,
  authorizeSystemIntent,
  ingestRuntimeAction,
} from '../runtime/features/runtimeSessions';
import {
  getRuntimeActionDomain,
  getRuntimeActionKind,
  type RuntimeAction,
} from '../runtime/plugin-runtime/contracts';
import type { CapabilityPolicy } from '../runtime/features/runtimeSessions';

export interface NavGoPayload {
  surfaceId: string;
  param?: string;
}

export interface PluginHostCallbacks {
  onNavGo: (payload: NavGoPayload) => void;
  onNavBack: () => void;
  onClose: () => void;
}

export interface ActionDispatchContext extends PluginHostCallbacks {
  dispatch: (action: unknown) => unknown;
  getState?: () => unknown;
  sessionId: string;
  surfaceId: string;
  windowId: string;
}

interface RuntimeStateLike {
  runtimeSessions?: {
    sessions?: Record<string, { capabilities?: CapabilityPolicy }>;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Routes a single RuntimeAction emitted by a plugin.
 *
 * 1. Always records it in the audit timeline (ingestRuntimeAction).
 * 2. draft.* / filters.* are applied to local state inside the reducer.
 * 3. domain/* is capability-gated; if allowed it is queued as a pending domain
 *    intent for an app reducer to consume (v1 has none, so it is only audited).
 * 4. system actions (nav.go, nav.back, notify.show, window.close) are
 *    capability-gated and mapped to host callbacks / toasts.
 */
export function dispatchRuntimeAction(action: RuntimeAction, context: ActionDispatchContext) {
  context.dispatch(
    ingestRuntimeAction({
      sessionId: context.sessionId,
      surfaceId: context.surfaceId,
      action,
    }),
  );

  const runtimeSession = (context.getState?.() as RuntimeStateLike | undefined)?.runtimeSessions?.sessions?.[
    context.sessionId
  ];
  const kind = getRuntimeActionKind(action.type);

  if (kind === 'domain' && runtimeSession?.capabilities) {
    const domain = getRuntimeActionDomain(action.type);
    const decision = authorizeDomainIntent(runtimeSession.capabilities, domain ?? '');
    if (!decision.allowed) {
      return;
    }
  }

  if (kind === 'system' && runtimeSession?.capabilities) {
    const decision = authorizeSystemIntent(runtimeSession.capabilities, action.type);
    if (!decision.allowed) {
      return;
    }
  }

  if (kind === 'domain') {
    // The action is recorded in the timeline and queued as a pending domain
    // intent. The feed domain middleware (features/feed/feedDomainMiddleware.ts)
    // consumes the queue and dispatches feed/* actions to the feed reducer.
    // Other domains would need their own consumer middleware.
    return;
  }

  if (kind === 'system') {
    if (action.type === 'nav.go') {
      if (isRecord(action.payload)) {
        const surface = action.payload.surfaceId;
        if (typeof surface === 'string' && surface.length > 0) {
          const param = typeof action.payload.param === 'string' ? action.payload.param : undefined;
          context.onNavGo({ surfaceId: surface, param });
        }
      }
      return;
    }

    if (action.type === 'nav.back') {
      context.onNavBack();
      return;
    }

    if (action.type === 'notify.show') {
      if (isRecord(action.payload)) {
        const message = action.payload.message;
        if (typeof message === 'string' && message.length > 0) {
          context.dispatch(addToast(message));
        }
      }
      return;
    }

    if (action.type === 'window.close') {
      context.onClose();
      return;
    }
  }
}
