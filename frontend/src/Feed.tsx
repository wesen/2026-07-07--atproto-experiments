import { useMemo } from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from './store'
import type { Post } from './types'
import type { FeedPost } from './runtime/plugin-runtime/contracts'
import { FirehosePlugins } from './components/FirehosePlugins'

// Cap the posts fed into the middleware pipeline + display. The live firehose
// delivers ~40 posts/s into a 500-post buffer; running the QuickJS pipeline
// over all of them on every tick would thrash. The latest 60 is enough to
// demonstrate filtering while keeping each pipeline run cheap.
const PIPELINE_CAP = 60

function toFeedPost(p: Post): FeedPost {
  return {
    id: p.uri,
    author: p.did,
    text: p.text,
    ts: Date.parse(p.createdAt) || Date.parse(p.time) || 0,
    tags: p.tags,
  }
}

export function Feed() {
  const posts = useSelector((s: RootState) => s.feed)
  const lastSeq = useSelector((s: RootState) => s.feed[0]?.seq ?? 0)

  const rate = useRate(posts)

  // Map + cap the firehose posts for the plugin pipeline. Memoized on the
  // posts array identity so it only recomputes when the store updates.
  const feedPosts = useMemo(
    () => posts.slice(0, PIPELINE_CAP).map(toFeedPost),
    [posts],
  )

  return (
    <div className="feed">
      <div className="feed-head">
        <h2>Live firehose</h2>
        <span className="meta">
          {posts.length} buffered · seq {lastSeq} · ~{rate}/s
        </span>
      </div>
      <FirehosePlugins posts={feedPosts} />
    </div>
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
