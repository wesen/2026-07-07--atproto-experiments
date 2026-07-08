// Vendored from @go-go-golems/os-scripting/@go-go-golems/os-ui-cards @ a554dc3 (2026-04-06). See src/runtime/VENDORED.md. Do not edit upstream; port fixes here.
export type StackId = string;
export type SessionId = string;
export type RuntimeSurfaceId = string;

export interface RuntimeErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export interface RuntimeAction {
  type: string;
  payload?: unknown;
  meta?: Record<string, unknown>;
}

export type RuntimeActionKind = 'draft' | 'filters' | 'plugin' | 'domain' | 'system' | 'unknown';

const SYSTEM_ACTION_TYPES = new Set(['nav.go', 'nav.back', 'notify.show', 'window.close']);

export function getRuntimeActionKind(actionType: string): RuntimeActionKind {
  if (actionType.startsWith('draft.')) {
    return 'draft';
  }

  if (actionType.startsWith('filters.')) {
    return 'filters';
  }

  if (actionType.startsWith('plugin/')) {
    return 'plugin';
  }

  if (SYSTEM_ACTION_TYPES.has(actionType)) {
    return 'system';
  }

  const slashIndex = actionType.indexOf('/');
  if (slashIndex > 0) {
    return 'domain';
  }

  return 'unknown';
}

export function getRuntimeActionDomain(actionType: string): string | null {
  if (getRuntimeActionKind(actionType) !== 'domain') {
    return null;
  }

  return actionType.split('/', 1)[0] ?? null;
}

export function getRuntimeActionOperation(actionType: string): string {
  if (actionType.startsWith('draft.')) {
    return actionType.slice('draft.'.length);
  }

  if (actionType.startsWith('filters.')) {
    return actionType.slice('filters.'.length);
  }

  if (actionType.startsWith('plugin/')) {
    return actionType.slice('plugin/'.length);
  }

  return actionType;
}

export interface RuntimeBundleHooksMeta {
  feedMiddleware: boolean;
  incomingFeedMessage: boolean;
}

export interface FeedPost {
  id: string;
  author: string;
  text: string;
  ts: number;
  tags?: string[];
  score?: number;
  meta?: Record<string, unknown>;
}

export interface FeedHookContext {
  now: number;
  reason: 'feed-changed' | 'plugin-state-changed' | 'incoming-message' | 'manual-refresh';
  self: {
    bundleId: string;
    sessionId: string;
  };
  feed: {
    totalPosts: number;
    lastMessageId?: string;
  };
}

export interface FeedMiddlewareInput {
  posts: FeedPost[];
  allPosts: FeedPost[];
  pluginState: unknown;
  context: FeedHookContext;
}

export interface FeedMiddlewareResult {
  posts?: FeedPost[];
  hiddenPostIds?: string[];
  annotations?: Record<string, Record<string, unknown>>;
  statePatch?: Record<string, unknown>;
  actions?: RuntimeAction[];
  debug?: Record<string, unknown>;
}

export interface IncomingFeedMessage {
  id: string;
  author: string;
  text: string;
  ts: number;
  source: 'seed' | 'simulator' | 'external' | 'plugin';
  tags?: string[];
  meta?: Record<string, unknown>;
}

export interface IncomingFeedMessageInput {
  message: IncomingFeedMessage;
  allPosts: FeedPost[];
  pluginState: unknown;
  context: FeedHookContext;
}

export interface IncomingFeedMessageResult {
  message?: IncomingFeedMessage;
  drop?: boolean;
  reason?: string;
  statePatch?: Record<string, unknown>;
  actions?: RuntimeAction[];
  debug?: Record<string, unknown>;
}

export interface RuntimeBundleMeta {
  stackId: StackId;
  sessionId: SessionId;
  declaredId?: string;
  title: string;
  description?: string;
  packageIds: string[];
  initialSessionState?: unknown;
  initialSurfaceState?: Record<string, unknown>;
  initialPluginState?: unknown;
  surfaces: string[];
  surfaceTypes?: Record<string, string>;
  hooks?: RuntimeBundleHooksMeta;
}

export interface LoadRuntimeBundleRequest {
  id: number;
  type: 'loadRuntimeBundle';
  stackId: StackId;
  sessionId: SessionId;
  code: string;
}

export interface RenderRuntimeSurfaceRequest {
  id: number;
  type: 'renderRuntimeSurface';
  sessionId: SessionId;
  surfaceId: RuntimeSurfaceId;
  state: unknown;
}

export interface EventRuntimeSurfaceRequest {
  id: number;
  type: 'eventRuntimeSurface';
  sessionId: SessionId;
  surfaceId: RuntimeSurfaceId;
  handler: string;
  args?: unknown;
  state: unknown;
}

export interface DefineRuntimeSurfaceRequest {
  id: number;
  type: 'defineRuntimeSurface';
  sessionId: SessionId;
  surfaceId: RuntimeSurfaceId;
  code: string;
  packId: string;
}

export interface DefineRuntimeSurfaceRenderRequest {
  id: number;
  type: 'defineRuntimeSurfaceRender';
  sessionId: SessionId;
  surfaceId: RuntimeSurfaceId;
  code: string;
}

export interface DefineRuntimeSurfaceHandlerRequest {
  id: number;
  type: 'defineRuntimeSurfaceHandler';
  sessionId: SessionId;
  surfaceId: RuntimeSurfaceId;
  handler: string;
  code: string;
}

export interface DisposeSessionRequest {
  id: number;
  type: 'disposeSession';
  sessionId: SessionId;
}

export interface HealthRequest {
  id: number;
  type: 'health';
}

export type WorkerRequest =
  | LoadRuntimeBundleRequest
  | RenderRuntimeSurfaceRequest
  | EventRuntimeSurfaceRequest
  | DefineRuntimeSurfaceRequest
  | DefineRuntimeSurfaceRenderRequest
  | DefineRuntimeSurfaceHandlerRequest
  | DisposeSessionRequest
  | HealthRequest;

export interface LoadRuntimeBundleResult {
  bundle: RuntimeBundleMeta;
}

export interface RenderRuntimeSurfaceResult {
  tree: unknown;
}

export interface EventRuntimeSurfaceResult {
  actions: RuntimeAction[];
}

export interface DefineRuntimeSurfaceResult {
  bundle: RuntimeBundleMeta;
}

export interface DisposeSessionResult {
  disposed: boolean;
}

export interface HealthResult {
  ready: true;
  sessions: string[];
}

export type WorkerResult =
  | LoadRuntimeBundleResult
  | RenderRuntimeSurfaceResult
  | EventRuntimeSurfaceResult
  | DefineRuntimeSurfaceResult
  | DisposeSessionResult
  | HealthResult;

export interface WorkerSuccessResponse {
  id: number;
  ok: true;
  result: WorkerResult;
}

export interface WorkerErrorResponse {
  id: number;
  ok: false;
  error: RuntimeErrorPayload;
}

export type WorkerResponse = WorkerSuccessResponse | WorkerErrorResponse;
