// PluginPanelHost — a compact panel host for one plugin, used by the social
// feed sidebar. Multiple panels can run concurrently; they share the Redux
// store, so domain actions (feed/*) emitted by any panel update the base site
// and every other panel re-renders.
import { usePluginRuntime } from './usePluginRuntime';
import { renderRuntimeSurfaceTree } from '../runtime/runtime-packs';
import type { PluginManifestEntry } from '../plugins/manifest';

export interface PluginPanelHostProps {
  plugin: PluginManifestEntry;
  sessionId: string;
  windowId: string;
  onClose: () => void;
  onViewSource?: () => void;
}

export function PluginPanelHost({ plugin, sessionId, windowId, onClose, onViewSource }: PluginPanelHostProps) {
  const rt = usePluginRuntime({ plugin, sessionId, windowId, onClose });

  return (
    <div className="plugin-panel">
      <div className="plugin-panel-bar">
        <strong>{plugin.title}</strong>
        <div className="plugin-panel-actions">
          {onViewSource && (
            <button type="button" className="icon-btn" title="View source" onClick={onViewSource}>
              {'</>'}
            </button>
          )}
          <button type="button" className="icon-btn" title="Remove plugin" onClick={onClose}>
            ✕
          </button>
        </div>
      </div>
      <div className="plugin-panel-body">
        {rt.status === 'missing' || rt.status === 'loading' ? (
          <span className="plugin-panel-hint">Loading…</span>
        ) : rt.status === 'error' ? (
          <span className="plugin-panel-hint plugin-panel-error">Error: {rt.error}</span>
        ) : !rt.tree || !rt.packId ? (
          <span className="plugin-panel-hint plugin-panel-error">
            {rt.renderError ? `Render error: ${rt.renderError}` : 'No output'}
          </span>
        ) : (
          renderRuntimeSurfaceTree(rt.packId, rt.tree, rt.emitRuntimeEvent)
        )}
      </div>
    </div>
  );
}
