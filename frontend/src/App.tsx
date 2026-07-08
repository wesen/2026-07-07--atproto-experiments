import { useEffect } from 'react'
import { Provider, useDispatch } from 'react-redux'
import { store, sessionFromStatus, type AppDispatch } from './store'
import { useFirehose } from './useFirehose'
import { Feed } from './Feed'
import { AccountPanel } from './AccountPanel'

// useSessionStatus fetches /api/status on mount and reflects the OAuth
// session state (set after the /oauth/callback redirect lands on /).
function useSessionStatus() {
  const dispatch = useDispatch<AppDispatch>()
  useEffect(() => {
    fetch('/api/status')
      .then((r) => r.json())
      .then((data) => dispatch(sessionFromStatus(data)))
      .catch(() => {})
  }, [dispatch])
}

function App() {
  useFirehose()
  useSessionStatus()
  return (
    <div className="app">
      <header>
        <h1>ATProto Firehose Demo</h1>
        <p>
          A learning app that subscribes to the Bluesky firehose and lets you
          post from your own account.
        </p>
      </header>
      <main>
        <Feed />
        <AccountPanel />
      </main>
      <footer>
        <a href="https://atproto.com/specs/sync">atproto sync spec</a> ·{' '}
        <a href="https://github.com/bluesky-social/indigo">indigo SDK</a>
      </footer>
    </div>
  )
}

export function Root() {
  return (
    <Provider store={store}>
      <App />
    </Provider>
  )
}
