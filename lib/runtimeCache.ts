/**
 * Runtime in-memory fallback cache.
 *
 * WHY THIS EXISTS
 * ---------------
 * The merchant notification feed and the broadcast history normally live in
 * MongoDB (primary) mirrored to Supabase. When BOTH providers are unreachable —
 * an expired Atlas password, a cluster whose DNS does not resolve, a Supabase
 * project that has not had the migration applied — the write used to fail
 * outright and the Super Admin saw a red "could not save" while the merchant
 * bell stayed empty.
 *
 * This module keeps the last-known records in the Node process so a broadcast
 * still reaches the bell for the lifetime of that process, instead of being
 * dropped on the floor. It is a DEGRADED mode, not a replacement:
 *
 *   • Reads merge the cache with whatever the databases returned, so a store
 *     that is up to date is never shadowed by a stale cached copy.
 *   • The cache is bounded (newest-first, capped) so a long-running process
 *     cannot grow without limit.
 *   • Nothing here throws. A cache miss is an empty array.
 *
 * IMPORTANT LIMITS — surface these to the operator, do not hide them:
 *   • The cache is per-process. It is NOT shared between serverless
 *     invocations, and a redeploy/restart empties it.
 *   • It does not survive more than one instance behind a load balancer.
 *   Therefore a write that only lands in the cache MUST be reported as a
 *   warning, and the underlying credentials/schema still have to be fixed.
 *
 * This is deliberately stored on `globalThis` so the Next/Vercel dev server's
 * hot reload does not silently create a second, empty cache mid-session.
 */

/** Bookkeeping for one cached collection. */
export interface RuntimeCacheEntry {
  /** The stored records, newest-first. */
  rows: Record<string, any>[];
  /** Why the last database write failed, so the API can explain itself. */
  lastError?: string;
  /** When the cache was last written to. */
  lastWriteAt?: string;
}

/** The subset of collections this cache is allowed to hold. */
export type RuntimeCacheCollection =
  | 'notifications'
  | 'broadcast_history'
  | 'support_tickets'
  | 'platform_config';

/**
 * Upper bound per collection. A broadcast feed only ever needs the recent tail,
 * and the reads all sort newest-first, so trimming old rows is safe.
 */
const MAX_ROWS_PER_COLLECTION = 300;

type RuntimeCacheState = Map<string, RuntimeCacheEntry>;

declare global {
  // eslint-disable-next-line no-var
  var __zidRuntimeCache: RuntimeCacheState | undefined;
}

/** The process-wide cache. Reused across hot reloads via globalThis. */
function store(): RuntimeCacheState {
  if (!global.__zidRuntimeCache) global.__zidRuntimeCache = new Map();
  return global.__zidRuntimeCache;
}

/** A stable key for a record, matching how the DB reads key rows. */
export function runtimeRowKey(row: Record<string, any>): string {
  return String(row?.id ?? row?._id ?? '').trim();
}

/** Newest-first ordering that tolerates the several timestamp spellings. */
function rowTimestamp(row: Record<string, any>): number {
  const raw = row?.createdAt || row?.created_at || row?.timestamp || row?.updatedAt || row?.updated_at;
  const parsed = new Date(String(raw || '')).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Insert or replace one record, keyed by `id`.
 *
 * `lastError` is recorded alongside so the next read can report that the value
 * it is serving came from memory rather than the database.
 */
export function cacheUpsert(
  collection: RuntimeCacheCollection,
  row: Record<string, any>,
  lastError?: string
): void {
  const key = runtimeRowKey(row);
  if (!key) return;
  const state = store();
  const entry = state.get(collection) || { rows: [] };

  const rows = entry.rows.filter((existing) => runtimeRowKey(existing) !== key);
  rows.unshift({ ...row });

  entry.rows = rows.sort((a, b) => rowTimestamp(b) - rowTimestamp(a)).slice(0, MAX_ROWS_PER_COLLECTION);
  entry.lastError = lastError || entry.lastError;
  entry.lastWriteAt = new Date().toISOString();
  state.set(collection, entry);
}

/** Merge one field into a cached record, preserving the rest of the row. */
export function cachePatch(
  collection: RuntimeCacheCollection,
  id: string,
  patch: Record<string, any>
): boolean {
  const key = String(id || '').trim();
  if (!key) return false;
  const entry = store().get(collection);
  if (!entry) return false;
  const index = entry.rows.findIndex((row) => runtimeRowKey(row) === key);
  if (index === -1) return false;
  entry.rows[index] = { ...entry.rows[index], ...patch };
  return true;
}

/** Every cached record for a collection, newest-first. Never throws. */
export function cacheRows(collection: RuntimeCacheCollection): Record<string, any>[] {
  return store().get(collection)?.rows || [];
}

/** The most recent write failure, for diagnostics. */
export function cacheLastError(collection: RuntimeCacheCollection): string | undefined {
  return store().get(collection)?.lastError;
}

/** True when the cache is currently holding records for this collection. */
export function cacheHasRows(collection: RuntimeCacheCollection): boolean {
  return cacheRows(collection).length > 0;
}

/** Drop everything. Test/ops helper; the app never calls this in normal flow. */
export function cacheClear(collection?: RuntimeCacheCollection): void {
  if (!collection) {
    store().clear();
    return;
  }
  store().delete(collection);
}

export const RUNTIME_CACHE_WARNING = 'Saved to runtime cache';

export default {
  cacheUpsert,
  cachePatch,
  cacheRows,
  cacheLastError,
  cacheHasRows,
  cacheClear,
  runtimeRowKey,
  RUNTIME_CACHE_WARNING,
};
