// Redux Toolkit store with two slices:
//   - feedSlice:   the live firehose post stream (capped ring buffer)
//   - sessionSlice: the authenticated bsky account + posting UI state
import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { Post } from './types'

const FEED_CAP = 500

const feedSlice = createSlice({
  name: 'feed',
  initialState: [] as Post[],
  reducers: {
    postReceived(state, action: PayloadAction<Post>) {
      const p = action.payload
      if (p.action === 'delete') {
        // A delete removes the matching record by URI, rather than
        // inserting a placeholder. Without this, delete events (which are
        // the newest seq) would pile up at the top of the feed.
        const i = state.findIndex((x) => x.uri === p.uri)
        if (i >= 0) state.splice(i, 1)
        return
      }
      // create/update: replace an existing entry for the same URI if present,
      // otherwise prepend (newest first).
      const i = state.findIndex((x) => x.uri === p.uri)
      if (i >= 0) {
        state[i] = p
      } else {
        state.unshift(p)
      }
      if (state.length > FEED_CAP) state.length = FEED_CAP
    },
    postsReceived(state, action: PayloadAction<Post[]>) {
      // Merge a snapshot batch (dedup by uri). Deletes from the snapshot are
      // not meaningful (the create may have arrived after), so we only keep
      // creates/updates and drop deletes here.
      const seen = new Set(state.map((p) => p.uri))
      for (const p of action.payload) {
        if (p.action === 'delete') continue
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
  did: string | null
  status: 'idle' | 'loading' | 'error'
  error: string | null
  postStatus: 'idle' | 'loading' | 'error' | 'ok'
  postError: string | null
}

const sessionSlice = createSlice({
  name: 'session',
  initialState: {
    did: null,
    status: 'idle',
    error: null,
    postStatus: 'idle',
    postError: null,
  } as SessionState,
  reducers: {
    sessionFromStatus(state, action: PayloadAction<{ loggedIn: boolean; did: string }>) {
      if (action.payload.loggedIn && action.payload.did) {
        state.did = action.payload.did
        state.status = 'idle'
      } else {
        state.did = null
        state.status = 'idle'
      }
    },
    loginRedirect(state) {
      state.status = 'loading'
      state.error = null
    },
    logoutDone(state) {
      state.did = null
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
  sessionFromStatus,
  loginRedirect,
  logoutDone,
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
