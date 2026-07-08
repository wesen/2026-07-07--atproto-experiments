import { useState } from 'react'
import { useSelector } from 'react-redux'
import { api } from './api'
import type { RootState } from './store'

const STARTER_SOURCE = `// Define a plugin bundle. The host installs the 'ui' package and evals
// this source inside a QuickJS sandbox. See ticket PLUGIN-RUNTIME.
defineRuntimeBundle(({ ui }) => ({
  id: 'my-plugin',
  title: 'My Plugin',
  packageIds: ['ui'],
  initialPluginState: { count: 0 },
  surfaces: {
    panel: {
      packId: 'ui.card.v1',
      render({ state }) {
        const c = (state.plugin && state.plugin.count) || 0
        return ui.panel([
          ui.text('Count: ' + c),
          ui.button('Bump', { onClick: { handler: 'bump' } }),
        ]);
      },
      handlers: {
        bump({ dispatchPluginAction }) {
          dispatchPluginAction('state.merge', { count: 1 });
        },
      },
    },
  },
}));
`

// PublishPlugin is the compose/publish UI for socially-shared JS plugins. It
// requires an authenticated session (OAuth DPoP) because publishing writes a
// dev.atproto-demo.plugin record to the logged-in user's repo. The source is a
// plain textarea; a syntax-highlighting editor is a future enhancement.
export function PublishPlugin() {
  const did = useSelector((s: RootState) => s.session.did)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [source, setSource] = useState(STARTER_SOURCE)
  const [packageIds, setPackageIds] = useState('ui')
  const [version, setVersion] = useState('')
  const [license, setLicense] = useState('MIT')
  const [feedMiddleware, setFeedMiddleware] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ uri: string; cid: string } | null>(null)
  const [error, setError] = useState('')

  if (!did) {
    return (
      <div className="publish">
        <h2>Publish a plugin</h2>
        <p className="hint">
          Sign in with Bluesky (Firehose tab) to publish a plugin record to your
          repository. Publishing uses a fine-grained OAuth scope limited to
          creating <code>dev.atproto-demo.plugin</code> records.
        </p>
      </div>
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !source.trim()) {
      setError('Title and source are required')
      return
    }
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const out = await api.publishPlugin({
        title: title.trim(),
        description: description.trim(),
        source,
        version: version.trim(),
        packageIds: packageIds.split(',').map((s) => s.trim()).filter(Boolean),
        capabilities: { domain: feedMiddleware ? ['feed'] : [], system: [] },
        hooks: feedMiddleware ? { feedMiddleware: true } : undefined,
        homeSurface: 'panel',
        license: license.trim(),
      })
      setResult(out)
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="publish">
      <h2>Publish a plugin</h2>
      <p className="hint">
        Signed in as <strong>{shortDid(did)}</strong>. Your source is published
        as a <code>dev.atproto-demo.plugin</code> record in your ATProto repo.
      </p>
      <form onSubmit={submit}>
        <input
          className="publish-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Plugin title"
          maxLength={128}
        />
        <input
          className="publish-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short description"
          maxLength={300}
        />
        <textarea
          className="publish-source"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          rows={20}
          spellCheck={false}
        />
        <div className="publish-meta">
          <label>
            packages
            <input value={packageIds} onChange={(e) => setPackageIds(e.target.value)} placeholder="ui" />
          </label>
          <label>
            version
            <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0.0" />
          </label>
          <label>
            license
            <input value={license} onChange={(e) => setLicense(e.target.value)} placeholder="MIT" />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={feedMiddleware}
              onChange={(e) => setFeedMiddleware(e.target.checked)}
            />
            feed middleware hook
          </label>
        </div>
        <button disabled={busy || !title.trim() || !source.trim()}>
          {busy ? 'Publishing…' : 'Publish plugin'}
        </button>
      </form>
      {result && (
        <div className="ok">
          <p>Published!</p>
          <p className="uri">{result.uri}</p>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}

function shortDid(did: string): string {
  const parts = did.split(':')
  return parts.length >= 3 ? parts.slice(2).join(':').slice(0, 10) : did
}
