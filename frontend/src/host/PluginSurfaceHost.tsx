// PluginSurfaceHost — fullpage host for one plugin (the "launch an app" demo).
// Uses the shared usePluginRuntime hook for the FRP loop.
import { usePluginRuntime } from './usePluginRuntime';
import { renderRuntimeSurfaceTree } from '../runtime/runtime-packs';
import type { PluginManifestEntry } from '../plugins/manifest';

export interface PluginSurfaceHostProps {
  plugin: PluginManifestEntry;
  sessionId: string;
  windowId: string;
  onClose: () => void;
}

export function PluginSurfaceHost({ plugin, sessionId, windowId, onClose }: PluginSurfaceHostProps) {
  const rt = usePluginRuntime({ plugin, sessionId, windowId, onClose });

  if (rt.status === 'missing' || rt.status === 'loading') {
    return <div className="plugin-loading">Loading plugin runtime…</div>;
  }
  if (rt.status === 'error') {
    return <div className="plugin-error">Runtime error: {rt.error}</div>;
  }
  if (!rt.tree) {
    return (
      <div className="plugin-error">
        {rt.renderError ? `Render error: ${rt.renderError}` : `No plugin output for surface: ${rt.currentSurfaceId}`}
      </div>
    );
  }
  if (!rt.packId) {
    return <div className="plugin-error">Render error: missing surface type for {rt.currentSurfaceId}</div>;
  }

  return (
    <div className="plugin-host">
      <div className="plugin-host-bar">
        <strong>{plugin.title}</strong>
        <span className="plugin-host-surface">{rt.currentSurfaceId}</span>
        <button type="button" className="link-btn" onClick={onClose}>
          ◀ Back to catalog
        </button>
      </div>
      <div className="plugin-host-surface-host">{renderRuntimeSurfaceTree(rt.packId, rt.tree, rt.emitRuntimeEvent)}</div>
    </div>
  );
}
