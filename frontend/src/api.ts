// Thin fetch wrapper for the Go backend's /api endpoints.
import type { Post, Status } from './types'

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
}
