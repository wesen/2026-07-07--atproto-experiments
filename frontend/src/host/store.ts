// Redux store for the page.
// - runtimeSessions: plugin VM session state, plugin-local state, capability gate, action timeline.
// - toasts: plugin/host notifications.
// - feed: canonical social-feed posts/events. Visible posts are derived by the active plugin middleware pipeline.
import { configureStore } from '@reduxjs/toolkit';
import { runtimeSessionsReducer, type RuntimeSessionsState } from '../runtime/features/runtimeSessions';
import { toastsReducer, type ToastsState } from './toastsSlice';
import { feedReducer, type FeedState } from '../features/feed/feedSlice';

// Explicit (non-circular) root state so host helpers can reference RootState
// without forming a ReturnType<Self> cycle.
export interface RootState {
  runtimeSessions: RuntimeSessionsState;
  toasts: ToastsState;
  feed: FeedState;
}

export const store = configureStore({
  reducer: {
    runtimeSessions: runtimeSessionsReducer,
    toasts: toastsReducer,
    feed: feedReducer,
  },
});

export type AppStore = typeof store;
export type AppDispatch = AppStore['dispatch'];
