import { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from './store'

// Thin fetch helpers for the /api/repo/* endpoints.
const base = '/api/repo'

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || res.statusText)
  }
  return res.json() as Promise<T>
}

interface RepoDescription {
  did: string
  handle: string
  handleIsCorrect: boolean
  collections: string[]
}

interface RecordSummary {
  uri: string
  cid: string
  rkey: string
}

interface RecordsResponse {
  records: RecordSummary[]
  cursor: string
}

interface RecordDetail {
  uri: string
  cid: string
  value: unknown
}

export function RepoBrowser() {
  const [identifier, setIdentifier] = useState('atproto.com')
  const [desc, setDesc] = useState<RepoDescription | null>(null)
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null)
  const [records, setRecords] = useState<RecordSummary[]>([])
  const [cursor, setCursor] = useState('')
  const [selectedRkey, setSelectedRkey] = useState<string | null>(null)
  const [detail, setDetail] = useState<RecordDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const did = useSelector((s: RootState) => s.session.did)

  const describe = async (id: string) => {
    setLoading(true); setError(null); setDesc(null); setSelectedCollection(null); setRecords([]); setSelectedRkey(null); setDetail(null)
    try {
      const d = await getJSON<RepoDescription>(`${base}/describe?repo=${encodeURIComponent(id)}`)
      setDesc(d)
    } catch (e) { setError(String(e)) } finally { setLoading(false) }
  }

  const loadRecords = async (collection: string, cur = '') => {
    setLoading(true); setError(null); setSelectedCollection(collection); setSelectedRkey(null); setDetail(null)
    try {
      const r = await getJSON<RecordsResponse>(`${base}/records?repo=${encodeURIComponent(identifier)}&collection=${encodeURIComponent(collection)}${cur ? `&cursor=${encodeURIComponent(cur)}` : ''}`)
      setRecords(cur ? [...records, ...r.records] : r.records)
      setCursor(r.cursor)
    } catch (e) { setError(String(e)) } finally { setLoading(false) }
  }

  const loadRecord = async (collection: string, rkey: string) => {
    setLoading(true); setError(null); setSelectedRkey(rkey)
    try {
      const d = await getJSON<RecordDetail>(`${base}/record?repo=${encodeURIComponent(identifier)}&collection=${encodeURIComponent(collection)}&rkey=${encodeURIComponent(rkey)}`)
      setDetail(d)
    } catch (e) { setError(String(e)) } finally { setLoading(false) }
  }

  useEffect(() => {
    // When the user is logged in, default the identifier to their own DID.
    if (did && !identifier) setIdentifier(did)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [did])

  return (
    <div className="repo-browser">
      <h2>Repository Browser</h2>
      <p className="hint">Browse any public ATProto repository by handle or DID.</p>
      <form onSubmit={(e) => { e.preventDefault(); describe(identifier) }} className="repo-input">
        <input
          placeholder="handle or DID (e.g. atproto.com)"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
        />
        {did && <button type="button" className="link" onClick={() => setIdentifier(did || '')}>use mine</button>}
        <button disabled={loading}>Describe</button>
      </form>
      {error && <p className="error">{error}</p>}

      <div className="repo-cols">
        {/* Column 1: collections */}
        <div className="repo-col">
          <h3>Collections</h3>
          {desc ? (
            <ul>
              {desc.collections.map((c) => (
                <li key={c} className={c === selectedCollection ? 'sel' : ''}>
                  <button className="link" onClick={() => loadRecords(c)}>{c}</button>
                </li>
              ))}
            </ul>
          ) : <p className="muted">describe a repo to list collections</p>}
          {desc && <p className="muted small">{desc.did} · @{desc.handle}</p>}
        </div>

        {/* Column 2: records in the selected collection */}
        <div className="repo-col">
          <h3>Records{selectedCollection ? ` (${selectedCollection})` : ''}</h3>
          {selectedCollection ? (
            <>
              <ul>
                {records.map((r) => (
                  <li key={r.uri} className={r.rkey === selectedRkey ? 'sel' : ''}>
                    <button className="link" onClick={() => loadRecord(selectedCollection, r.rkey)} title={r.uri}>{r.rkey}</button>
                  </li>
                ))}
              </ul>
              {cursor && <button className="link" onClick={() => loadRecords(selectedCollection, cursor)}>load more…</button>}
            </>
          ) : <p className="muted">select a collection</p>}
        </div>

        {/* Column 3: record detail */}
        <div className="repo-col">
          <h3>Record</h3>
          {detail ? (
            <div>
              <p className="muted small">{detail.uri}</p>
              <pre className="json">{JSON.stringify(detail.value, null, 2)}</pre>
            </div>
          ) : <p className="muted">select a record</p>}
        </div>
      </div>
    </div>
  )
}
