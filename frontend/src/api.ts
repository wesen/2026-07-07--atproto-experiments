// Thin fetch wrapper for the Go backend's /api endpoints.
import type { Post, Session, Status } from './types'

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
  login: (identifier: string, password: string, host?: string) =>
    jsonFetch<Session>(`${base}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password, host }),
    }),
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
