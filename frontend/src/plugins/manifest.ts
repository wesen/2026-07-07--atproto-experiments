// Plugin catalog for the merged atproto-experiments app (tickets PLUGIN-RUNTIME
// + firehose middleware).
//
// Built-in plugins are bundled at build time via Vite ?raw imports (trusted).
// Network plugins are discovered from /api/plugins/feed (same-origin) and
// bookmarked by the user before running (see networkLoader.ts).
//
// PLUGIN_CATALOG: standalone apps launchable from the Plugins tab.
// FEED_PLUGINS: feed-middleware plugins (feed.apply hook) added to the
// firehose sidebar to filter/manipulate visible posts.
import type { CapabilityPolicy } from '../runtime/features/runtimeSessions';
import counterBundle from './counter.vm.js?raw';
import feedKeywordLensBundle from './feed-keyword-lens.vm.js?raw';
import feedAuthorMuteBundle from './feed-author-mute.vm.js?raw';
import feedFreshnessWindowBundle from './feed-freshness-window.vm.js?raw';
import feedTopicTaggerBundle from './feed-topic-tagger.vm.js?raw';

export interface PluginManifestEntry {
  id: string;
  title: string;
  description: string;
  packageIds: string[];
  capabilities: Partial<CapabilityPolicy>;
  homeSurface: string;
  bundleCode: string;
  category?: string;
  origin?: 'builtin' | 'network';
  uri?: string;
  cid?: string;
}

export const PLUGIN_CATALOG: PluginManifestEntry[] = [
  {
    id: 'counter',
    title: 'Counter',
    description: 'A tiny counter. Demonstrates local draft state, a system toast, and nav.back.',
    packageIds: ['ui'],
    capabilities: { domain: [], system: ['notify.show', 'nav.back'] },
    homeSurface: 'main',
    bundleCode: counterBundle,
    category: 'Apps',
    origin: 'builtin',
  },
];

export const FEED_PLUGINS: PluginManifestEntry[] = [
  {
    id: 'feed-keyword-lens',
    title: 'Keyword Lens',
    description: 'Filter posts by author or text. Query lives in plugin state.',
    packageIds: ['ui'],
    capabilities: { domain: ['feed'], system: [] },
    homeSurface: 'panel',
    bundleCode: feedKeywordLensBundle,
    category: 'Feed middleware',
    origin: 'builtin',
  },
  {
    id: 'feed-author-mute',
    title: 'Author Mute',
    description: 'Hide posts from muted authors (by DID). Mute list lives in plugin state.',
    packageIds: ['ui'],
    capabilities: { domain: ['feed'], system: [] },
    homeSurface: 'panel',
    bundleCode: feedAuthorMuteBundle,
    category: 'Feed middleware',
    origin: 'builtin',
  },
  {
    id: 'feed-freshness-window',
    title: 'Freshness Window',
    description: 'Show only posts within a selected time window (minutes).',
    packageIds: ['ui'],
    capabilities: { domain: ['feed'], system: [] },
    homeSurface: 'panel',
    bundleCode: feedFreshnessWindowBundle,
    category: 'Feed middleware',
    origin: 'builtin',
  },
  {
    id: 'feed-topic-tagger',
    title: 'Topic Tagger',
    description: 'Tag posts by keyword and filter by selected topic.',
    packageIds: ['ui'],
    capabilities: { domain: ['feed'], system: [] },
    homeSurface: 'panel',
    bundleCode: feedTopicTaggerBundle,
    category: 'Feed middleware',
    origin: 'builtin',
  },
];

export function findPlugin(id: string): PluginManifestEntry | undefined {
  return [...PLUGIN_CATALOG, ...FEED_PLUGINS].find((p) => p.id === id);
}

export const ALL_PLUGINS: PluginManifestEntry[] = [...PLUGIN_CATALOG, ...FEED_PLUGINS];
