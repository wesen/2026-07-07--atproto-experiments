// React hook that opens the /ws WebSocket to the Go backend and dispatches
// each incoming post into the Redux store. Reconnects with backoff.
import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { postReceived, postsReceived } from './store'
import type { Post } from './types'

export function useFirehose() {
  const dispatch = useDispatch()

  useEffect(() => {
    let ws: WebSocket | null = null
    let retry = 0
    let closed = false

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${location.host}/ws`)
      ws.onopen = () => {
        retry = 0
      }
      ws.onmessage = (ev) => {
        try {
          const post = JSON.parse(ev.data) as Post
          dispatch(postReceived(post))
        } catch {
          // ignore malformed frames
        }
      }
      ws.onclose = () => {
        if (closed) return
        const delay = Math.min(1000 * 2 ** retry, 30000)
        retry++
        setTimeout(connect, delay)
      }
      ws.onerror = () => {
        ws?.close()
      }
    }

    // Seed the feed with a recent snapshot over HTTP.
    fetch('/api/posts')
      .then((r) => r.json())
      .then((posts: Post[]) => dispatch(postsReceived(posts)))
      .catch(() => {})

    connect()

    return () => {
      closed = true
      ws?.close()
    }
  }, [dispatch])
}
