// Redux Toolkit store with two slices:
//   - feedSlice:   the live firehose post stream (capped ring buffer)
//   - sessionSlice: the authenticated bsky account + posting UI state
import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { Post, Session } from './types'

const FEED_CAP = 500

const feedSlice = createSlice({
  name: 'feed',
  initialState: [] as Post[],
  reducers: {
    postReceived(state, action: PayloadAction<Post>) {
      state.unshift(action.payload)
      if (state.length > FEED_CAP) state.length = FEED_CAP
    },
    postsReceived(state, action: PayloadAction<Post[]>) {
      // Prepend a batch of recent posts (dedup by uri).
      const seen = new Set(state.map((p) => p.uri))
      for (const p of action.payload) {
        if (!seen.has(p.uri)) {
          state.push(p)
          seen.add(p.uri)
        }
      }
      // newest first
      state.sort((a, b) => b.seq - a.seq)
      if (state.length > FEED_CAP) state.length = FEED_CAP
    },
  },
})

interface SessionState {
  session: Session | null
  status: 'idle' | 'loading' | 'error'
  error: string | null
  postStatus: 'idle' | 'loading' | 'error' | 'ok'
  postError: string | null
}

const sessionSlice = createSlice({
  name: 'session',
  initialState: {
    session: null,
    status: 'idle',
    error: null,
    postStatus: 'idle',
    postError: null,
  } as SessionState,
  reducers: {
    loginStart(state) {
      state.status = 'loading'
      state.error = null
    },
    loginSuccess(state, action: PayloadAction<Session>) {
      state.session = action.payload
      state.status = 'idle'
    },
    loginError(state, action: PayloadAction<string>) {
      state.status = 'error'
      state.error = action.payload
    },
    logout(state) {
      state.session = null
      state.status = 'idle'
    },
    postStart(state) {
      state.postStatus = 'loading'
      state.postError = null
    },
    postSuccess(state) {
      state.postStatus = 'ok'
    },
    postError(state, action: PayloadAction<string>) {
      state.postStatus = 'error'
      state.postError = action.payload
    },
    postReset(state) {
      state.postStatus = 'idle'
    },
  },
})

export const {
  postReceived,
  postsReceived,
} = feedSlice.actions
export const {
  loginStart,
  loginSuccess,
  loginError,
  logout,
  postStart,
  postSuccess,
  postError,
  postReset,
} = sessionSlice.actions

export const store = configureStore({
  reducer: {
    feed: feedSlice.reducer,
    session: sessionSlice.reducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
