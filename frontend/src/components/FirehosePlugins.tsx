// FirehosePlugins — the firehose view with loadable feed-middleware plugins
// (merged PLUGIN-RUNTIME + firehose middleware).
//
// The live firehose posts (from the atproto store) are mapped to FeedPost and
// passed in as a prop. Active feed-middleware plugins run feed.apply in sidebar
// order to derive the visible posts. Plugin-local state (e.g. a search query,
// a mute list) lives in the runtime store; editing it reruns the pipeline.
//
// Wrapped in the runtime Redux store so the pipeline's selectors/dispatch
// target the runtime store, while the firehose posts come from the atproto
// store (passed as a prop by the parent Feed component).
import { useMemo, useState } from 'react';
import { Provider } from 'react-redux';
import { store as runtimeStore } from '../host/store';
import { FEED_PLUGINS, findPlugin, type PluginManifestEntry } from '../plugins/manifest';
import { PluginPanelHost } from '../host/PluginPanelHost';
import { useFeedPluginPipeline } from '../features/feed/useFeedPluginPipeline';
import type { ActiveFeedPluginSession } from '../features/feed/feedPluginPipeline';
import type { FeedPost } from '../runtime/plugin-runtime/contracts';
import { getCachedEntry, ensureSource } from '../plugins/networkLoader';
import { useBookmarkedPlugins } from '../plugins/useNetworkFeed';

interface ActivePlugin {
  id: string;
  sessionId: string;
}

function postClass(annotation: Record<string, unknown> | undefined): string {
  const classes = ['fh-post'];
  if (annotation?.keywordMatch) classes.push('fh-post-match');
  return classes.join(' ');
}

function FirehosePluginsInner({ posts }: { posts: FeedPost[] }) {
  const [active, setActive] = useState<ActivePlugin[]>([]);
  const [source, setSource] = useState<PluginManifestEntry | null>(null);
  const [addError, setAddError] = useState('');

  // Bookmarked network feed-middleware plugins can also be added to the
  // sidebar, completing the social loop for feed middleware.
  const bookmarked = useBookmarkedPlugins();
  const networkFeedPlugins = bookmarked.filter((p) => p.hooks?.feedMiddleware === true);
  const addList = [...FEED_PLUGINS, ...networkFeedPlugins];

  const activeSessions: ActiveFeedPluginSession[] = useMemo(
    () => active.map((entry) => ({ id: entry.id, sessionId: entry.sessionId })),
    [active],
  );
  const pipeline = useFeedPluginPipeline(activeSessions, posts);

  // Resolve an entry by id: built-in first, then the network cache (network
  // plugins are keyed by their AT URI, which is the entry id).
  const resolveEntry = (id: string): PluginManifestEntry | undefined =>
    findPlugin(id) ?? getCachedEntry(id);

  const addPlugin = async (id: string) => {
    if (active.some((a) => a.id === id)) return;
    setAddError('');
    const entry = resolveEntry(id);
    // Network plugins need their source fetched before the panel/pipeline can
    // load the bundle. Built-ins already have bundleCode.
    if (entry?.origin === 'network' && entry && !entry.bundleCode) {
      try {
        await ensureSource(entry);
      } catch (err) {
        setAddError(String(err));
        return;
      }
    }
    setActive((cur) => [...cur, { id, sessionId: `fh-${id}-${Math.random().toString(36).slice(2, 7)}` }]);
  };
  const removePlugin = (id: string) => setActive((cur) => cur.filter((a) => a.id !== id));

  return (
    <div className="fh-layout">
      <div className="fh-main">
        <div className="fh-toolbar">
          <span className="fh-stats">
            {pipeline.visiblePosts.length}/{posts.length} visible · {active.length} plugins
          </span>
          {pipeline.errors.length > 0 && (
            <span className="fh-err">{pipeline.errors.join(' · ')}</span>
          )}
        </div>
        <ul className="fh-posts">
          {pipeline.visiblePosts.map((post) => {
            const annotation = pipeline.annotations[post.id];
            const tags = Array.isArray(annotation?.tags) ? annotation.tags : post.tags;
            return (
              <li key={post.id} className={postClass(annotation)}>
                <div className="fh-post-head">
                  <strong>{shortDid(post.author)}</strong>
                  <time>{new Date(post.ts).toLocaleTimeString()}</time>
                </div>
                <p>{post.text}</p>
                {Array.isArray(tags) && tags.length > 0 && (
                  <div className="fh-tags">{tags.map((t) => <span key={String(t)}>#{String(t)}</span>)}</div>
                )}
              </li>
            );
          })}
          {pipeline.visiblePosts.length === 0 && (
            <li className="fh-empty">No posts survived the active middleware chain.</li>
          )}
        </ul>
        <details className="fh-trace">
          <summary>Pipeline trace ({pipeline.trace.length})</summary>
          <ol>
            {pipeline.trace.map((step, i) => (
              <li key={`${step.sessionId}:${i}`}>
                <code>{step.pluginId}</code> {step.before} → {step.after} ({step.durationMs.toFixed(1)}ms)
                {step.error ? <span className="fh-err"> {step.error}</span> : null}
              </li>
            ))}
          </ol>
        </details>
      </div>
      <aside className="fh-sidebar">
        <div className="fh-add">
          <span className="fh-add-label">Add feed plugin</span>
          <div className="fh-add-buttons">
            {addList.map((plugin) => {
              const isActive = active.some((a) => a.id === plugin.id);
              return (
                <button
                  key={plugin.id}
                  type="button"
                  className="fh-add-btn"
                  disabled={isActive}
                  title={plugin.description}
                  onClick={() => addPlugin(plugin.id)}
                >
                  + {plugin.title}{plugin.origin === 'network' ? ' ✨' : ''}
                </button>
              );
            })}
          </div>
          {addError && <span className="fh-err">{addError}</span>}
        </div>
        {active.map((entry) => {
          const plugin = resolveEntry(entry.id);
          if (!plugin) return null;
          return (
            <PluginPanelHost
              key={entry.id}
              plugin={plugin}
              sessionId={entry.sessionId}
              windowId={entry.sessionId}
              onClose={() => removePlugin(entry.id)}
              onViewSource={() => setSource(plugin)}
            />
          );
        })}
        {active.length === 0 && (
          <p className="fh-sidebar-hint">
            No middleware plugins. The firehose is unfiltered. Add a plugin to filter or manipulate
            visible posts.
          </p>
        )}
      </aside>
      {source && (
        <div className="source-modal" onClick={() => setSource(null)}>
          <div className="source-modal-inner" onClick={(e) => e.stopPropagation()}>
            <div className="source-modal-bar">
              <strong>{source.title}</strong>
              <button onClick={() => setSource(null)}>close</button>
            </div>
            <pre className="source-pre">{source.bundleCode}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

function shortDid(did: string): string {
  const parts = did.split(':');
  return parts.length >= 3 ? parts.slice(2).join(':').slice(0, 10) : did;
}

export function FirehosePlugins({ posts }: { posts: FeedPost[] }) {
  return (
    <Provider store={runtimeStore}>
      <FirehosePluginsInner posts={posts} />
    </Provider>
  );
}
