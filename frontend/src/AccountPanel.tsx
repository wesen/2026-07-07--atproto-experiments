import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { api } from './api'
import {
  loginError,
  loginStart,
  loginSuccess,
  logout,
  postError as postErrorAction,
  postReset,
  postStart,
  postSuccess,
  type RootState,
} from './store'

export function AccountPanel() {
  const dispatch = useDispatch()
  const session = useSelector((s: RootState) => s.session.session)
  const status = useSelector((s: RootState) => s.session.status)
  const error = useSelector((s: RootState) => s.session.error)

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')

  if (session) {
    return <PostBox session={session} onLogout={() => dispatch(logout())} />
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    dispatch(loginStart())
    try {
      const s = await api.login(identifier, password)
      dispatch(loginSuccess(s))
    } catch (err) {
      dispatch(loginError(String(err)))
    }
  }

  return (
    <form className="account" onSubmit={submit}>
      <h2>Sign in to your bsky account</h2>
      <p className="hint">
        Use an <strong>app password</strong> from bsky.app/settings, not your
        main password.
      </p>
      <input
        placeholder="handle or DID (e.g. alice.bsky.social)"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
      />
      <input
        type="password"
        placeholder="app password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button disabled={status === 'loading'}>
        {status === 'loading' ? 'Signing in…' : 'Sign in'}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  )
}

function PostBox({
  session,
  onLogout,
}: {
  session: { did: string; handle: string }
  onLogout: () => void
}) {
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
        Signed in as <strong>@{session.handle}</strong>
        <button className="link" onClick={onLogout}>
          sign out
        </button>
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
