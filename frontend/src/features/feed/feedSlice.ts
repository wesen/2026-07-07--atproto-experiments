// The canonical social-feed domain.
//
// In the stateful middleware experiment, the feed reducer owns only source-of-
// truth data: posts, an event log, and simulator sequencing. Visibility,
// search, muting, ranking, favourites, spam decisions, and annotations are all
// derived by active plugin middleware from plugin-local state.
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface FeedPost {
  id: string;
  author: string;
  text: string;
  ts: number;
  tags?: string[];
  score?: number;
  meta?: Record<string, unknown>;
}

export interface FeedEvent {
  id: string;
  type: 'message.received' | 'message.appended' | 'message.dropped' | 'message.modified' | 'feed.reset';
  ts: number;
  source: 'seed' | 'simulator' | 'external' | 'plugin' | 'host';
  messageId?: string;
  pluginSessionId?: string;
  reason?: string;
  payload?: unknown;
}

export interface FeedState {
  posts: FeedPost[];
  events: FeedEvent[];
  nextSimulatedId: number;
}

const now = Date.now();

export const SEED_POSTS: FeedPost[] = [
  { id: 'p1', author: 'alice', text: 'just shipped the plugin VM sandbox 🎉', ts: now - 1000 * 60 * 5, tags: ['vm'] },
  { id: 'p2', author: 'bob', text: 'anyone else think FRP is just redux with better PR?', ts: now - 1000 * 60 * 12, tags: ['frp'] },
  { id: 'p3', author: 'carol', text: 'quickjs in the browser is surprisingly fast', ts: now - 1000 * 60 * 30, tags: ['vm', 'quickjs'] },
  { id: 'p4', author: 'dave', text: 'flagging this thread, too much hype', ts: now - 1000 * 60 * 44, tags: ['meta'] },
  { id: 'p5', author: 'alice', text: 'remember: plugins cannot touch the DOM', ts: now - 1000 * 60 * 60, tags: ['security'] },
  { id: 'p6', author: 'bob', text: 'the timeline debug panel is chef’s kiss', ts: now - 1000 * 60 * 90, tags: ['debug'] },
  { id: 'p7', author: 'carol', text: 'search me: try the middleware plugin 🔍', ts: now - 1000 * 60 * 120, tags: ['plugin'] },
  { id: 'p8', author: 'dave', text: 'star your favourite authors with a stateful plugin', ts: now - 1000 * 60 * 180, tags: ['plugin'] },
];

const initialState: FeedState = {
  posts: SEED_POSTS,
  events: [],
  nextSimulatedId: 1,
};

function pushEvent(state: FeedState, event: FeedEvent) {
  state.events.unshift(event);
  if (state.events.length > 80) {
    state.events.splice(80);
  }
}

const feedSlice = createSlice({
  name: 'feed',
  initialState,
  reducers: {
    appendFeedPost(state, action: PayloadAction<{ post: FeedPost; source?: FeedEvent['source'] }>) {
      state.posts.unshift(action.payload.post);
      pushEvent(state, {
        id: `evt-${action.payload.post.id}`,
        type: 'message.appended',
        ts: Date.now(),
        source: action.payload.source ?? 'host',
        messageId: action.payload.post.id,
        payload: action.payload.post,
      });
    },
    recordFeedEvent(state, action: PayloadAction<Omit<FeedEvent, 'id' | 'ts'> & { id?: string; ts?: number }>) {
      pushEvent(state, {
        id: action.payload.id ?? `evt-${Date.now()}-${state.events.length}`,
        ts: action.payload.ts ?? Date.now(),
        ...action.payload,
      });
    },
    bumpSimulatorCounter(state) {
      state.nextSimulatedId += 1;
    },
    resetFeed() {
      return {
        ...initialState,
        posts: [...SEED_POSTS],
        events: [{ id: `evt-reset-${Date.now()}`, type: 'feed.reset', ts: Date.now(), source: 'host' }],
      };
    },
  },
});

export const { appendFeedPost, bumpSimulatorCounter, recordFeedEvent, resetFeed } = feedSlice.actions;
export const feedReducer = feedSlice.reducer;

// --- Selectors ---

export interface FeedSlice {
  feed: FeedState;
}

export const selectFeed = (state: FeedSlice): FeedState => state.feed;
export const selectPosts = (state: FeedSlice): FeedPost[] => state.feed.posts;
export const selectFeedEvents = (state: FeedSlice): FeedEvent[] => state.feed.events;
export const selectNextSimulatedId = (state: FeedSlice): number => state.feed.nextSimulatedId;

/** Unique authors, in first-appearance order. */
export const selectAuthors = (state: FeedSlice): string[] => {
  const seen = new Set<string>();
  const authors: string[] = [];
  for (const post of state.feed.posts) {
    if (!seen.has(post.author)) {
      seen.add(post.author);
      authors.push(post.author);
    }
  }
  return authors;
};
