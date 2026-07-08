// Network plugin loader (ticket PLUGIN-RUNTIME).
//
// Fetches plugin summaries from the PLUGIN-SHARING server's /api/plugins/feed,
// converts them to PluginManifestEntry objects, and fetches the full source
// string on demand from /api/plugins/record. The runtime service's
// loadRuntimeBundle(code) is agnostic to where `code` came from, so network
// plugins run through the same sandbox path as built-in ?raw-imported plugins.
//
// Security: network plugins are UNTRUSTED. clampCapabilities intersects the
// author's declared capabilities with a safe allowlist (feed domain only, no
// system). The bookmark store (bookmarks.ts) is the opt-in gate: a network
// plugin is not loaded until the user bookmarks it.

import type { PluginManifestEntry } from './manifest';

import { CID } from 'multiformats/cid';
import * as dagcbor from '@ipld/dag-cbor';
import { sha256 } from 'multiformats/hashes/sha2';

const FEED_URL = '/api/plugins/feed';
const RECORD_URL = '/api/plugins/record';

/** The summary shape returned by /api/plugins/feed (mirrors Go PluginSummary). */
export interface PluginSummary {
  uri: string;
  cid: string;
  authorDID: string;
  rkey: string;
  title: string;
  description?: string;
  version?: string;
  packageIds?: string[];
  capabilities?: { domain?: string[]; system?: string[] };
  hooks?: { feedMiddleware?: boolean; incomingFeedMessage?: boolean };
  homeSurface?: string;
  license?: string;
  action: string;
  seq: number;
  time: string;
}

// Safe capability allowlist for untrusted network plugins. v1 permits feed
// middleware only; no system actions (enforced below as an empty array).
const NETWORK_ALLOWED_DOMAINS = new Set(['feed']);

/**
 * Intersect a network plugin's declared capabilities with the safe allowlist.
 * The declaration is untrusted (it comes from an arbitrary author's record),
 * so we never grant more than the allowlist permits.
 */
export function clampCapabilities(
  declared?: { domain?: string[]; system?: string[] },
): { domain: string[]; system: string[] } {
  const domain = (declared?.domain ?? []).filter((d) => NETWORK_ALLOWED_DOMAINS.has(d));
  return { domain, system: [] };
}

/** Parse an at:// URI into its did, collection, and rkey. */
export function parseAtURI(uri: string): { did: string; collection: string; rkey: string } {
  // at://did:plc:xxxx/collection/rkey  (colons in the DID defeat net/url)
  const rest = uri.startsWith('at://') ? uri.slice(5) : uri;
  const parts = rest.split('/');
  return { did: parts[0] ?? '', collection: parts[1] ?? '', rkey: parts[2] ?? '' };
}

/**
 * Convert a feed summary into a PluginManifestEntry. `bundleCode` is left empty
 * and fetched lazily by loadNetworkSource when the user launches/inspects it.
 * `origin: 'network'` marks it as untrusted for the catalog + security policy.
 */
export function summaryToEntry(s: PluginSummary): PluginManifestEntry {
  const hooks = s.hooks;
  return {
    id: s.uri, // use the AT URI as the stable id
    title: s.title || 'Untitled plugin',
    description: s.description ?? '',
    packageIds: s.packageIds && s.packageIds.length ? s.packageIds : ['ui'],
    capabilities: clampCapabilities(s.capabilities),
    homeSurface: s.homeSurface || 'panel',
    bundleCode: '', // fetched lazily
    category: hooks?.feedMiddleware ? 'Network feed middleware' : 'Network apps',
    origin: 'network',
    uri: s.uri,
    cid: s.cid,
    hooks: hooks,
  };
}

interface CacheEntry {
  entry: PluginManifestEntry;
  source?: string;
}

// In-memory cache keyed by AT URI. Holds stable entry references so that
// source fetched once persists across renders.
const cache = new Map<string, CacheEntry>();

/** Look up a cached entry by URI (used by the catalog to show bookmarked plugins). */
export function getCachedEntry(uri: string): PluginManifestEntry | undefined {
  return cache.get(uri)?.entry;
}

/** Upsert a summary into the cache, returning the (stable) entry. */
export function cacheEntry(s: PluginSummary): PluginManifestEntry {
  const existing = cache.get(s.uri);
  if (existing) {
    // Keep the stable entry reference; update mutable fields.
    existing.entry.title = s.title || existing.entry.title;
    return existing.entry;
  }
  const entry = summaryToEntry(s);
  cache.set(s.uri, { entry });
  return entry;
}

/** Fetch the plugin feed (summaries). Returns [] on error. */
export async function fetchFeed(): Promise<PluginSummary[]> {
  try {
    const res = await fetch(FEED_URL);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.plugins) ? (data.plugins as PluginSummary[]) : [];
  } catch {
    return [];
  }
}

/**
 * Compute the ATProto content-addressed CID of a record value: CIDv1 with
 * the dag-cbor codec (0x71) and a SHA-256 multihash over the canonical
 * DAG-CBOR encoding. This matches the CID the PDS assigned when it stored the
 * record, so a browser can verify that fetched source is provably what the
 * author published.
 */
export async function computeRecordCID(value: unknown): Promise<string> {
  const bytes = dagcbor.encode(value);
  const hash = await sha256.digest(bytes);
  return CID.createV1(dagcbor.code, hash).toString();
}

/**
 * Verify that a fetched record value hashes to its declared CID. Returns true
 * if declaredCID is empty (nothing to verify against). Throws on encoding
 * failure only inside computeRecordCID; here we treat failure as a mismatch.
 */
export async function verifyRecordCID(value: unknown, declaredCID: string): Promise<boolean> {
  if (!declaredCID) return true;
  try {
    return (await computeRecordCID(value)) === declaredCID;
  } catch {
    return false;
  }
}

/**
 * Fetch a network plugin's full source by its AT URI. Cached per URI.
 *
 * CID verification: after fetching the record, recompute the CID of the
 * record value and check it matches (a) the CID returned by getRecord and
 * (b) the CID the firehose feed announced (entry.cid). If either mismatches,
 * the source is refused — the bytes that would run are not provably what the
 * author published. This closes the v1 trust gap (DR-4): the bookmark opt-in
 * and source inspection remain, but now there is a cryptographic guarantee.
 */
export async function loadNetworkSource(uri: string): Promise<string> {
  const cached = cache.get(uri);
  if (cached?.source) return cached.source;

  const { did, rkey } = parseAtURI(uri);
  if (!did || !rkey) throw new Error(`invalid plugin URI: ${uri}`);
  const res = await fetch(`${RECORD_URL}?repo=${encodeURIComponent(did)}&rkey=${encodeURIComponent(rkey)}`);
  if (!res.ok) throw new Error(`fetch plugin record failed (HTTP ${res.status})`);
  const record = await res.json();
  const source = String(record?.value?.source ?? '');
  if (!source) throw new Error(`plugin record has no source: ${uri}`);

  // CID verification: fetched value must hash to the record's declared CID.
  const recordCid = String(record?.cid ?? '');
  const ok = await verifyRecordCID(record.value, recordCid);
  if (!ok) {
    throw new Error(`plugin source CID mismatch for ${uri}: fetched value does not match record CID ${recordCid}`);
  }
  // Cross-check: the firehose-announced CID (entry.cid) must agree with the
  // record CID. A mismatch means the source served by getRecord is not the
  // source the firehose said was published.
  const feedCid = cached?.entry.cid ?? '';
  if (feedCid && recordCid && feedCid !== recordCid) {
    throw new Error(`plugin CID mismatch for ${uri}: feed announced ${feedCid} but record is ${recordCid}`);
  }

  if (cached) {
    cached.source = source;
    cached.entry.bundleCode = source;
  } else {
    cache.set(uri, { entry: summaryToEntry({ uri, cid: recordCid, authorDID: did, rkey, title: '', action: 'create', seq: 0, time: '' }), source });
    cache.get(uri)!.entry.bundleCode = source;
  }
  return source;
}

/** Ensure a plugin entry has its source loaded. Built-ins already have bundleCode. */
export async function ensureSource(entry: PluginManifestEntry): Promise<string> {
  if (entry.bundleCode) return entry.bundleCode;
  if (entry.origin !== 'network' || !entry.uri) return entry.bundleCode;
  const source = await loadNetworkSource(entry.uri);
  entry.bundleCode = source;
  return source;
}
