// React hooks for network plugin discovery and bookmarks (ticket PLUGIN-RUNTIME).

import { useEffect, useState } from 'react';
import { fetchFeed, cacheEntry, getCachedEntry, type PluginSummary } from './networkLoader';
import { getBookmarks, isBookmarked } from './bookmarks';
import type { PluginManifestEntry } from './manifest';

const POLL_MS = 30_000;

/**
 * Polls /api/plugins/feed and caches the summaries. Returns the latest
 * summary list. v1 polls; a WebSocket subscription is a future step.
 */
export function useNetworkFeed(): PluginSummary[] {
  const [summaries, setSummaries] = useState<PluginSummary[]>([]);
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      const s = await fetchFeed();
      if (cancelled) return;
      for (const summary of s) cacheEntry(summary);
      setSummaries(s);
    }
    tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);
  return summaries;
}

/**
 * Subscribes to bookmark changes. Returns the list of bookmarked network
 * plugin entries (resolved from the loader cache). A bookmark whose summary
 * has not yet been cached is skipped until the feed delivers it.
 */
export function useBookmarkedPlugins(): PluginManifestEntry[] {
  const [uris, setUris] = useState<string[]>(getBookmarks());
  useEffect(() => {
    const handler = () => setUris(getBookmarks());
    window.addEventListener('bookmarks-changed', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('bookmarks-changed', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);
  // Resolve URIs to cached entries; filter missing (not-yet-discovered) ones.
  return uris
    .map((uri) => getCachedEntry(uri))
    .filter((e): e is PluginManifestEntry => e !== undefined);
}

/** Whether a given URI is bookmarked (re-renders on changes). */
export function useIsBookmarked(uri: string | undefined): boolean {
  const [bookmarked, setBookmarked] = useState<boolean>(uri ? isBookmarked(uri) : false);
  useEffect(() => {
    if (!uri) {
      setBookmarked(false);
      return;
    }
    const handler = () => setBookmarked(isBookmarked(uri));
    setBookmarked(isBookmarked(uri));
    window.addEventListener('bookmarks-changed', handler);
    return () => window.removeEventListener('bookmarks-changed', handler);
  }, [uri]);
  return bookmarked;
}
