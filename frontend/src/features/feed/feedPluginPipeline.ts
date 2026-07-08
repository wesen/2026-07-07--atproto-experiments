import type {
  FeedHookContext,
  FeedMiddlewareResult,
  FeedPost,
  IncomingFeedMessage,
  IncomingFeedMessageResult,
  RuntimeAction,
} from '../../runtime/plugin-runtime/contracts';

export interface ActiveFeedPluginSession {
  id: string;
  sessionId: string;
}

export interface FeedPipelineTraceEntry {
  pluginId: string;
  sessionId: string;
  hook: 'apply' | 'incoming';
  before: number;
  after: number;
  hidden: number;
  durationMs: number;
  reason?: string;
  debug?: Record<string, unknown>;
  error?: string;
}

export interface FeedPipelineOutput {
  visiblePosts: FeedPost[];
  annotations: Record<string, Record<string, unknown>>;
  trace: FeedPipelineTraceEntry[];
  errors: string[];
}

export interface HookEffect {
  sessionId: string;
  pluginId: string;
  action: RuntimeAction;
}

export interface PipelineRunResult {
  output: FeedPipelineOutput;
  effects: HookEffect[];
}

export const emptyPipelineOutput = (posts: FeedPost[]): FeedPipelineOutput => ({
  visiblePosts: posts,
  annotations: {},
  trace: [],
  errors: [],
});

export function normalizeFeedPosts(value: FeedPost[] | undefined, fallback: FeedPost[]): FeedPost[] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  return value.filter(
    (post): post is FeedPost =>
      typeof post?.id === 'string' &&
      typeof post.author === 'string' &&
      typeof post.text === 'string' &&
      typeof post.ts === 'number',
  );
}

export function applyFeedMiddlewareResult(
  plugin: ActiveFeedPluginSession,
  inputPosts: FeedPost[],
  result: FeedMiddlewareResult,
  durationMs: number,
): { posts: FeedPost[]; annotations: Record<string, Record<string, unknown>>; trace: FeedPipelineTraceEntry; effects: HookEffect[] } {
  const hidden = new Set(result.hiddenPostIds ?? []);
  const nextPosts = normalizeFeedPosts(result.posts, inputPosts).filter((post) => !hidden.has(post.id));
  const effects: HookEffect[] = [];
  if (result.statePatch) {
    effects.push({
      pluginId: plugin.id,
      sessionId: plugin.sessionId,
      action: { type: 'plugin/state.merge', payload: result.statePatch },
    });
  }
  for (const action of result.actions ?? []) {
    effects.push({ pluginId: plugin.id, sessionId: plugin.sessionId, action });
  }

  return {
    posts: nextPosts,
    annotations: result.annotations ?? {},
    trace: {
      pluginId: plugin.id,
      sessionId: plugin.sessionId,
      hook: 'apply',
      before: inputPosts.length,
      after: nextPosts.length,
      hidden: Math.max(0, inputPosts.length - nextPosts.length),
      durationMs,
      debug: result.debug,
    },
    effects,
  };
}

export function mergeAnnotations(
  target: Record<string, Record<string, unknown>>,
  incoming: Record<string, Record<string, unknown>>,
) {
  for (const [postId, annotation] of Object.entries(incoming)) {
    target[postId] = { ...(target[postId] ?? {}), ...annotation };
  }
}

export function buildFeedHookContext(
  plugin: ActiveFeedPluginSession,
  allPosts: FeedPost[],
  reason: FeedHookContext['reason'],
): FeedHookContext {
  return {
    now: Date.now(),
    reason,
    self: { bundleId: plugin.id, sessionId: plugin.sessionId },
    feed: { totalPosts: allPosts.length, lastMessageId: allPosts[0]?.id },
  };
}

export function incomingMessageToPost(message: IncomingFeedMessage): FeedPost {
  return {
    id: message.id,
    author: message.author,
    text: message.text,
    ts: message.ts,
    tags: message.tags,
    meta: message.meta,
  };
}

export function applyIncomingMessageResult(
  plugin: ActiveFeedPluginSession,
  message: IncomingFeedMessage,
  result: IncomingFeedMessageResult,
  durationMs: number,
): { message: IncomingFeedMessage; dropped: boolean; trace: FeedPipelineTraceEntry; effects: HookEffect[]; reason?: string } {
  const effects: HookEffect[] = [];
  if (result.statePatch) {
    effects.push({ pluginId: plugin.id, sessionId: plugin.sessionId, action: { type: 'plugin/state.merge', payload: result.statePatch } });
  }
  for (const action of result.actions ?? []) {
    effects.push({ pluginId: plugin.id, sessionId: plugin.sessionId, action });
  }
  const nextMessage = result.message ?? message;
  return {
    message: nextMessage,
    dropped: result.drop === true,
    reason: result.reason,
    effects,
    trace: {
      pluginId: plugin.id,
      sessionId: plugin.sessionId,
      hook: 'incoming',
      before: 1,
      after: result.drop === true ? 0 : 1,
      hidden: result.drop === true ? 1 : 0,
      durationMs,
      reason: result.reason,
      debug: result.debug,
    },
  };
}
