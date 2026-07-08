// Bookmark store (ticket PLUGIN-RUNTIME).
//
// Persists the user's chosen network plugin URIs to localStorage. Bookmarks
// are the opt-in gate: a network plugin is runnable only after the user
// bookmarks it. This prevents drive-by execution of arbitrary firehose
// content. A `bookmarks-changed` CustomEvent is dispatched on every mutation
// so React hooks can re-render without polling.

const KEY = 'vm-plugin-bookmarks';

export function getBookmarks(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === 'string') : [];
  } catch {
    return [];
  }
}

export function isBookmarked(uri: string): boolean {
  return getBookmarks().includes(uri);
}

export function addBookmark(uri: string): void {
  const next = Array.from(new Set([...getBookmarks(), uri]));
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('bookmarks-changed'));
}

export function removeBookmark(uri: string): void {
  const next = getBookmarks().filter((u) => u !== uri);
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('bookmarks-changed'));
}
