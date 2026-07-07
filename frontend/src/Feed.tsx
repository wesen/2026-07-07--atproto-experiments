import { useMemo } from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from './store'
import type { Post } from './types'

export function Feed() {
  const posts = useSelector((s: RootState) => s.feed)
  const lastSeq = useSelector((s: RootState) => s.feed[0]?.seq ?? 0)

  const rate = useRate(posts)

  return (
    <div className="feed">
      <div className="feed-head">
        <h2>Live firehose</h2>
        <span className="meta">
          {posts.length} shown · seq {lastSeq} · ~{rate}/s
        </span>
      </div>
      <ul>
        {posts.map((p) => (
          <PostRow key={p.uri} post={p} />
        ))}
      </ul>
    </div>
  )
}

function PostRow({ post }: { post: Post }) {
  const handle = useMemo(() => shortDid(post.did), [post.did])
  const deleted = post.action === 'delete'
  return (
    <li className={deleted ? 'post deleted' : 'post'}>
      <div className="post-meta">
        <span className="did">{handle}</span>
        <span className="time">{relTime(post.createdAt)}</span>
        <span className="action">{post.action}</span>
      </div>
      <div className="post-text">{deleted ? <em>(deleted)</em> : post.text}</div>
      {post.tags && post.tags.length > 0 && (
        <div className="tags">{post.tags.map((t) => `#${t}`).join(' ')}</div>
      )}
    </li>
  )
}

// Rough events-per-second estimate over the last 5s of posts.
function useRate(posts: Post[]): number {
  return useMemo(() => {
    if (posts.length < 2) return 0
    const now = Date.now()
    const recent = posts.filter((p) => now - new Date(p.time).getTime() < 5000)
    return recent.length > 1 ? Math.round(recent.length / 5) : 0
  }, [posts])
}

function shortDid(did: string): string {
  // did:plc:abcdef... -> abcdef
  const parts = did.split(':')
  return parts.length >= 3 ? parts.slice(2).join(':').slice(0, 10) : did
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h`
}
