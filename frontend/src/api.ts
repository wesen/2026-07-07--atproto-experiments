// Thin fetch wrapper for the Go backend's /api endpoints.
import type { Post, Status } from './types'

export interface PluginSummary {
  uri: string
  cid: string
  authorDID: string
  rkey: string
  title: string
  description?: string
  version?: string
  packageIds?: string[]
  capabilities?: { domain?: string[]; system?: string[] }
  hooks?: { feedMiddleware?: boolean; incomingFeedMessage?: boolean }
  homeSurface?: string
  license?: string
  action: string
  seq: number
  time: string
}

export interface PublishPluginInput {
  title: string
  description?: string
  source: string
  version?: string
  packageIds: string[]
  capabilities: { domain: string[]; system: string[] }
  hooks?: { feedMiddleware?: boolean; incomingFeedMessage?: boolean }
  homeSurface?: string
  license?: string
}

const base = '/api'

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || res.statusText)
  }
  return res.json() as Promise<T>
}

export const api = {
  status: () => jsonFetch<Status>(`${base}/status`),
  posts: () => jsonFetch<Post[]>(`${base}/posts`),
  // Login is a full-page redirect to /oauth/login, not a fetch, because the
  // OAuth flow navigates away to bsky.app and back. After the callback
  // redirects to /, /api/status will report loggedIn.
  logout: () =>
    fetch(`${base.replace('/api', '')}/oauth/logout`, { method: 'POST' }),
  post: (text: string) =>
    jsonFetch<{ uri: string; cid: string }>(`${base}/post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }),
  like: (uri: string, cid: string) =>
    jsonFetch<{ uri: string }>(`${base}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uri, cid }),
    }),
  // --- plugin sharing (ticket PLUGIN-SHARING) ---
  publishPlugin: (input: PublishPluginInput) =>
    jsonFetch<{ uri: string; cid: string }>(`${base}/plugins/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  pluginFeed: () =>
    jsonFetch<{ plugins: PluginSummary[] }>(`${base}/plugins/feed`),
  listPlugins: (repo: string, cursor?: string) =>
    jsonFetch<{ records: unknown[]; cursor: string }>(
      `${base}/plugins/list?repo=${encodeURIComponent(repo)}${cursor ? `&cursor=${cursor}` : ''}`,
    ),
  getPlugin: (repo: string, rkey: string) =>
    jsonFetch<{ uri: string; cid: string; value: Record<string, unknown> }>(
      `${base}/plugins/record?repo=${encodeURIComponent(repo)}&rkey=${encodeURIComponent(rkey)}`,
    ),
}
