// Plugins tab for the merged atproto-experiments app (ticket PLUGIN-RUNTIME).
//
// This is the "run JS plugins in our app" half: a single tab that lists
// built-in plugins, discovers network plugins from /api/plugins/feed (same
// origin), lets the user bookmark (opt-in) and inspect source, and launches
// a plugin inside the vendored QuickJS sandbox via PluginSurfaceHost.
//
// The runtime owns its own Redux store (host/store.ts), wrapped here in a
// nested <Provider> so the runtime's selectors read from the runtime store
// while the rest of the app reads from the atproto store.
import { useMemo, useState } from 'react';
import { Provider } from 'react-redux';
import { store as runtimeStore } from '../host/store';
import { registerUiRuntime } from '../ui/runtimeRegistration';
import { PluginSurfaceHost } from '../host/PluginSurfaceHost';
import { PLUGIN_CATALOG, type PluginManifestEntry } from '../plugins/manifest';
import { useNetworkFeed, useBookmarkedPlugins } from '../plugins/useNetworkFeed';
import { addBookmark, removeBookmark } from '../plugins/bookmarks';
import { ensureSource } from '../plugins/networkLoader';

// Register the ui runtime package + ui.card.v1 surface type once.
registerUiRuntime();

function domainLabel(plugin: PluginManifestEntry): string {
  const domain = plugin.capabilities.domain;
  if (!Array.isArray(domain)) return domain ?? '—';
  return domain.length === 0 ? '—' : domain.join(', ');
}

function shortDid(did: string): string {
  const parts = did.split(':');
  return parts.length >= 3 ? parts.slice(2).join(':').slice(0, 10) : did;
}

function PluginTabInner() {
  const [active, setActive] = useState<PluginManifestEntry | null>(null);
  const [viewSource, setViewSource] = useState<PluginManifestEntry | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState<string | null>(null);

  const sessionId = useMemo(
    () => (active ? `session-${active.id}-${Math.random().toString(36).slice(2, 8)}` : null),
    [active],
  );

  const networkFeed = useNetworkFeed();
  const bookmarked = useBookmarkedPlugins();
  const bookmarkedUris = new Set(bookmarked.map((p) => p.uri));
  const discovered = networkFeed.filter((s) => !bookmarkedUris.has(s.uri));

  async function launch(plugin: PluginManifestEntry) {
    setError('');
    if (plugin.origin === 'network' && !plugin.bundleCode) {
      setLoading(plugin.uri ?? plugin.id);
      try {
        await ensureSource(plugin);
      } catch (err) {
        setError(String(err));
        setLoading(null);
        return;
      }
      setLoading(null);
    }
    setActive(plugin);
  }

  async function inspect(plugin: PluginManifestEntry) {
    setError('');
    if (plugin.origin === 'network' && !plugin.bundleCode) {
      setLoading(plugin.uri ?? plugin.id);
      try {
        await ensureSource(plugin);
      } catch (err) {
        setError(String(err));
        setLoading(null);
        return;
      }
      setLoading(null);
    }
    setViewSource(plugin);
  }

  if (active && sessionId) {
    return <PluginSurfaceHost plugin={active} sessionId={sessionId} windowId={sessionId} onClose={() => setActive(null)} />;
  }

  return (
    <div className="plugins-tab">
      <h2>Plugins</h2>
      <p className="hint">
        Run sandboxed JS plugins in a QuickJS VM. Built-in plugins are bundled; network plugins come
        from the ATProto plugin feed — bookmark one to inspect and run it.
      </p>
      {error && <p className="error">{error}</p>}

      {bookmarked.length > 0 && (
        <section className="plugin-group">
          <h3>★ My plugins</h3>
          <div className="plugin-cards">
            {bookmarked.map((p) => (
              <PluginCard key={p.uri} plugin={p} network loading={loading === (p.uri ?? p.id)}
                onLaunch={() => launch(p)} onInspect={() => inspect(p)} onToggleBookmark={() => removeBookmark(p.uri!)} />
            ))}
          </div>
        </section>
      )}

      <section className="plugin-group">
        <h3>Built-in</h3>
        <div className="plugin-cards">
          {PLUGIN_CATALOG.map((p) => (
            <PluginCard key={p.id} plugin={p} onLaunch={() => launch(p)} onInspect={() => inspect(p)} />
          ))}
        </div>
      </section>

      {discovered.length > 0 && (
        <section className="plugin-group">
          <h3>Discover (network)</h3>
          <p className="hint">Plugins from the ATProto firehose. Bookmark to enable.</p>
          <div className="plugin-cards">
            {discovered.map((s) => (
              <div key={s.uri} className="plugin-card net">
                <strong>{s.title || 'Untitled'} <span className="badge-net">net</span></strong>
                <span className="desc">{s.description ?? ''}</span>
                <code>by {shortDid(s.authorDID)}</code>
                <div className="actions">
                  <button className="bm" onClick={() => addBookmark(s.uri)}>☆ Add</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {viewSource && (
        <div className="source-modal" onClick={() => setViewSource(null)}>
          <div className="source-modal-inner" onClick={(e) => e.stopPropagation()}>
            <div className="source-modal-bar">
              <strong>{viewSource.title}</strong>
              <button onClick={() => setViewSource(null)}>close</button>
            </div>
            <pre className="source-pre">{viewSource.bundleCode}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

function PluginCard({
  plugin, network, loading, onLaunch, onInspect, onToggleBookmark,
}: {
  plugin: PluginManifestEntry;
  network?: boolean;
  loading?: boolean;
  onLaunch: () => void;
  onInspect: () => void;
  onToggleBookmark?: () => void;
}) {
  return (
    <div className={'plugin-card' + (network ? ' net' : '')}>
      <strong>{plugin.title}{network && <span className="badge-net">net</span>}</strong>
      <span className="desc">{plugin.description}</span>
      <code>packages: {plugin.packageIds.join(', ')} · domain: {domainLabel(plugin)}</code>
      <div className="actions">
        <button className="launch" onClick={onLaunch} disabled={loading}>
          {loading ? 'Loading…' : 'Launch'}
        </button>
        <button className="inspect" onClick={onInspect}>Source</button>
        {network && <button className="bm" onClick={onToggleBookmark}>★ Remove</button>}
      </div>
    </div>
  );
}

// Wrap the tab in the runtime store so the QuickJS runtime's Redux selectors
// read from the runtime store, separate from the atproto app store.
export function PluginTab() {
  return (
    <Provider store={runtimeStore}>
      <PluginTabInner />
    </Provider>
  );
}
