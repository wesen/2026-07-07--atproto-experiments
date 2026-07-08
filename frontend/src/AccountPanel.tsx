import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { api } from './api'
import {
  loginRedirect,
  logoutDone,
  postError as postErrorAction,
  postReset,
  postStart,
  postSuccess,
  type RootState,
} from './store'

// Starts the OAuth DPoP login flow. This is a full-page navigation (not a
// fetch) because the OAuth flow redirects away to bsky.app and back.
function startLogin(handle: string) {
  const params = new URLSearchParams({ handle })
  window.location.href = `/oauth/login?${params.toString()}`
}

export function AccountPanel() {
  const dispatch = useDispatch()
  const did = useSelector((s: RootState) => s.session.did)
  const status = useSelector((s: RootState) => s.session.status)
  const error = useSelector((s: RootState) => s.session.error)
  const [handle, setHandle] = useState('')

  if (did) {
    return <PostBox did={did} onLogout={async () => {
      await api.logout()
      dispatch(logoutDone())
    }} />
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!handle.trim()) return
    dispatch(loginRedirect())
    startLogin(handle.trim())
  }

  return (
    <form className="account" onSubmit={submit}>
      <h2>Sign in with Bluesky</h2>
      <p className="hint">
        You'll be redirected to bsky.app to approve access. We never see your
        password — login uses OAuth with DPoP-bound tokens.
      </p>
      <input
        placeholder="handle (e.g. alice.bsky.social)"
        value={handle}
        onChange={(e) => setHandle(e.target.value)}
      />
      <button disabled={status === 'loading' || !handle.trim()}>
        {status === 'loading' ? 'Redirecting…' : 'Sign in with Bluesky'}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  )
}

function PostBox({ did, onLogout }: { did: string; onLogout: () => void }) {
  const dispatch = useDispatch()
  const postStatus = useSelector((s: RootState) => s.session.postStatus)
  const postErr = useSelector((s: RootState) => s.session.postError)
  const [text, setText] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    dispatch(postStart())
    try {
      await api.post(text)
      dispatch(postSuccess())
      setText('')
      setTimeout(() => dispatch(postReset()), 2000)
    } catch (err) {
      dispatch(postErrorAction(String(err)))
    }
  }

  return (
    <div className="account">
      <div className="who">
        Signed in as <strong>{shortDid(did)}</strong>
        <button className="link" onClick={onLogout}>sign out</button>
      </div>
      <form onSubmit={submit}>
        <textarea
          placeholder="What's happening?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={300}
        />
        <button disabled={postStatus === 'loading' || !text.trim()}>
          {postStatus === 'loading' ? 'Posting…' : 'Post'}
        </button>
      </form>
      {postStatus === 'ok' && <p className="ok">Posted!</p>}
      {postErr && <p className="error">{postErr}</p>}
    </div>
  )
}

function shortDid(did: string): string {
  const parts = did.split(':')
  return parts.length >= 3 ? parts.slice(2).join(':').slice(0, 10) : did
}
