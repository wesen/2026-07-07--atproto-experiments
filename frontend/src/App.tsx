import { useEffect, useState } from 'react'
import { Provider, useDispatch } from 'react-redux'
import { store, sessionFromStatus, type AppDispatch } from './store'
import { useFirehose } from './useFirehose'
import { Feed } from './Feed'
import { AccountPanel } from './AccountPanel'
import { RepoBrowser } from './RepoBrowser'
import { PublishPlugin } from './PublishPlugin'
import { PluginTab } from './components/PluginTab'

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
  const [tab, setTab] = useState<'feed' | 'repo' | 'publish' | 'plugins'>('feed')
  return (
    <div className="app">
      <header>
        <h1>ATProto Firehose Demo</h1>
        <nav className="tabs">
          <button className={tab === 'feed' ? 'tab sel' : 'tab'} onClick={() => setTab('feed')}>Firehose</button>
          <button className={tab === 'repo' ? 'tab sel' : 'tab'} onClick={() => setTab('repo')}>Repository</button>
          <button className={tab === 'publish' ? 'tab sel' : 'tab'} onClick={() => setTab('publish')}>Publish</button>
          <button className={tab === 'plugins' ? 'tab sel' : 'tab'} onClick={() => setTab('plugins')}>Plugins</button>
        </nav>
      </header>
      <main>
        {tab === 'feed' ? (
          <>
            <Feed />
            <AccountPanel />
          </>
        ) : tab === 'repo' ? (
          <RepoBrowser />
        ) : tab === 'publish' ? (
          <PublishPlugin />
        ) : (
          <PluginTab />
        )}
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
