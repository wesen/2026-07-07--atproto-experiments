import { Provider } from 'react-redux'
import { store } from './store'
import { useFirehose } from './useFirehose'
import { Feed } from './Feed'
import { AccountPanel } from './AccountPanel'

function App() {
  useFirehose()
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
