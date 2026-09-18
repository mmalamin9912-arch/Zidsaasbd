/**
 * Hybrid (dual-database) data access.
 *
 * STRATEGY
 * --------
 *   MongoDB  = PRIMARY   → merchants, products, orders, subscription plans,
 *                          platform analytics. Aggregations run here because the
 *                          collections are indexed and the data is authoritative.
 *   Supabase = SECONDARY → auth users, real-time tables (`subscriptions`,
 *                          `domains`, `merchants`) and the fallback source when
 *                          Mongo is empty, unconfigured, or times out.
 *
 * DESIGN RULES
 * ------------
 *  - NOTHING here throws. Every provider call is wrapped, so a missing key, a
 *    DNS failure or a timeout degrades to "no rows from this provider" and the
 *    caller still gets a fully-shaped payload. This is what keeps a route from
 *    answering 404/500 when one database is unhappy.
 *  - The two sources are MERGED, not replaced. Mongo wins per-entity (it is the
 *    operational store), and Supabase fills the gaps — so a merchant that only
 *    exists in Supabase still appears, and Mongo-only metrics are never zeroed
 *    just because Supabase has a matching row.
 *  - Every result carries a `sources` field describing which providers actually
 *    answered, so the UI (and the logs) can explain a surprising number.
 *
 * Import-safe from the Express bootstrap (server.ts), the bundled Vercel app
 * (api/server.ts) and standalone functions (api/*.ts).
 */

import { getMongoDb, getMongoUri, describeMongoError, DB_NAME } from './db.js';

/* ────────────────────────── provider config ────────────────────────── */

function cleanEnvUrl(raw?: string): string {
  if (!raw) return '';
  return String(raw)
    .trim()
    .replace(/^["'`\\]+|["'`\\]+$/g, '')
    .trim()
    .replace(/\/+$/, '');
}

function cleanEnvKey(raw?: string): string {
  if (!raw) return '';
  let str = String(raw).trim();
  str = str.replace(/^["'`\\]+|["'`\\]+$/g, '').trim();
  return str.replace(/^["'`\\]+|["'`\\]+$/g, '').trim();
}

function isValidUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Resolve the Supabase REST credentials. Reads every env spelling used across
 * this codebase (Vite, Next and server-only), so the same helper works in the
 * browser-facing build and in a serverless function.
 */
export function getSupabaseServerConfig() {
  const rawUrl =
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    '';
  const rawKey =
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY ||
    '';
  const supabaseUrl = cleanEnvUrl(rawUrl);
  const supabaseKey = cleanEnvKey(rawKey);
  return {
    supabaseUrl,
    supabaseKey,
    isConfigured: Boolean(supabaseUrl && supabaseKey && isValidUrl(supabaseUrl)),
  };
}

/* ────────────────────────── result envelope ────────────────────────── */

export type DataSource = 'mongodb' | 'supabase' | 'none';

export interface HybridResult<T> {
  /** Merged rows (Mongo first, Supabase filling the gaps). */
  data: T[];
  /** Which providers actually returned rows. */
  sources: DataSource[];
  /** true when at least one provider answered with rows. */
  ok: boolean;
  mongodb: { ok: boolean; count: number; error?: string };
  supabase: { ok: boolean; count: number; error?: string };
}

/* ────────────────────────── Supabase REST ────────────────────────── */

/**
 * Query a Supabase table through the REST API.
 *
 * Returns [] (never throws) when Supabase is unconfigured, the request fails,
 * the body is not JSON, or the table is missing — so a fallback query can never
 * take down the primary path.
 */
export async function querySupabaseTable<T = Record<string, any>>(
  table: string,
  opts: { select?: string; filters?: Record<string, string>; limit?: number } = {}
): Promise<{ rows: T[]; error?: string }> {
  const { supabaseUrl, supabaseKey, isConfigured } = getSupabaseServerConfig();
  if (!isConfigured) return { rows: [], error: 'Supabase is not configured.' };

  const params = new URLSearchParams();
  params.set('select', opts.select || '*');
  params.set('limit', String(opts.limit ?? 1000));
  for (const [key, value] of Object.entries(opts.filters || {})) {
    if (value) params.set(key, value);
  }

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/${table}?${params.toString()}`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Accept: 'application/json',
      },
      // Never let a hanging Supabase request stall the whole route.
      signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
    });

    if (!res.ok) {
      return { rows: [], error: `Supabase ${table} responded ${res.status}` };
    }
    const text = await res.text();
    if (!text || text.trimStart().startsWith('<')) return { rows: [] };
    const parsed = JSON.parse(text);
    return { rows: Array.isArray(parsed) ? (parsed as T[]) : [] };
  } catch (err: any) {
    return { rows: [], error: err?.message || `Supabase ${table} query failed` };
  }
}

/* ────────────────────────── MongoDB helper ────────────────────────── */

/** Native Db handle, or null. Never throws. */
async function safeMongoDb(): Promise<{ db: any | null; error?: string }> {
  if (!getMongoUri()) return { db: null, error: describeMongoError(new Error('MONGODB_URI is not set')).message };
  try {
    const db = await getMongoDb(DB_NAME);
    return db ? { db } : { db: null, error: 'MongoDB connection handle unavailable.' };
  } catch (err: any) {
    return { db: null, error: describeMongoError(err).message };
  }
}

/** Read every document from a Mongo collection. Never throws; missing → []. */
export async function queryMongoCollection<T = Record<string, any>>(
  collection: string,
  query: Record<string, any> = {},
  opts: { limit?: number; sort?: Record<string, 1 | -1>; dbName?: string } = {}
): Promise<{ rows: T[]; error?: string }> {
  try {
    const resolved = opts.dbName ? await (async () => {
      if (!getMongoUri()) return { db: null, error: 'MONGODB_URI is not set' };
      return { db: await getMongoDb(opts.dbName!) };
    })() : await safeMongoDb();
    const db = (resolved as any).db;
    if (!db) return { rows: [], error: (resolved as any).error || 'MongoDB unavailable.' };

    let cursor = db.collection(collection).find(query);
    if (opts.sort) cursor = cursor.sort(opts.sort);
    cursor = cursor.limit(opts.limit ?? 5000);
    const rows: T[] = await cursor.toArray();
    return { rows: Array.isArray(rows) ? rows : [] };
  } catch (err: any) {
    const missing = /ns not found|does not exist/i.test(String(err?.message || ''));
    if (!missing) console.warn(`[hybrid] Mongo ${collection} warning:`, err?.message || err);
    return { rows: [], error: missing ? undefined : err?.message || 'MongoDB query failed' };
  }
}

/* ────────────────────────── merge helpers ────────────────────────── */

/**
 * Stable identity key for a merchant/store row across both providers.
 *
 * The SAME store is described differently by each provider — MongoDB usually
 * keys off `store_slug`/`store_code` (with `_id` as the document id), while the
 * Supabase mirror keys off the `id` UUID. Preferring `id` first therefore failed
 * to match them and produced DUPLICATE rows (one per provider) instead of a
 * merge.
 *
 * The slug/code is the shared, human-stable identifier, so it is checked FIRST;
 * `id`-style keys are only a fallback for a row that has no slug at all. Mongo's
 * `_id` is deliberately excluded — it is a document id, never a business key.
 */
export function merchantIdentity(row: Record<string, any>): string {
  const slugish = row?.store_slug ?? row?.storeSlug ?? row?.store_code ?? row?.storeCode ?? row?.slug;
  if (slugish !== undefined && slugish !== null && slugish !== '') {
    return String(slugish).trim().toLowerCase();
  }
  const idish = row?.id ?? row?.store_id ?? row?.storeId ?? row?.merchant_id ?? row?.email;
  return String(idish ?? '').trim().toLowerCase();
}

/** First defined, non-empty value among `keys`. */
export function pick(row: Record<string, any>, keys: string[]): any {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

export function toNumber(value: any, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/**
 * Merge two row sets, keyed by identity. MongoDB rows win field-by-field;
 * Supabase rows ONLY contribute when the same key is absent from Mongo; new
 * keys are appended so a Supabase-only merchant still shows up.
 */
export function mergeRows(
  mongoRows: Record<string, any>[],
  supabaseRows: Record<string, any>[],
  keyFn: (row: Record<string, any>) => string = merchantIdentity
): Record<string, any>[] {
  const merged = new Map<string, Record<string, any>>();

  for (const row of mongoRows) {
    const key = keyFn(row) || `mongo:${merged.size}`;
    if (!merged.has(key)) merged.set(key, { ...row, _source: 'mongodb' });
  }

  for (const row of supabaseRows) {
    const key = keyFn(row);
    if (!key) {
      merged.set(`supabase:${merged.size}`, { ...row, _source: 'supabase' });
      continue;
    }
    const existing = merged.get(key);
    if (!existing) {
      // Supabase-only row — include it so the fallback actually adds coverage.
      merged.set(key, { ...row, _source: 'supabase' });
      continue;
    }
    // Both providers know this entity: keep Mongo's values, backfill the gaps.
    for (const [field, value] of Object.entries(row)) {
      if (existing[field] === undefined || existing[field] === null || existing[field] === '') {
        if (value !== undefined && value !== null && value !== '') existing[field] = value;
      }
    }
  }

  return [...merged.values()];
}

/* ────────────────────────── high-level hybrid reads ────────────────────────── */

/**
 * Fetch merchants from MongoDB, falling back to (and merged with) the Supabase
 * `merchants` table. Mongo is authoritative per store; a Supabase-only merchant
 * is still returned.
 */
export async function fetchHybridMerchants(): Promise<HybridResult<Record<string, any>>> {
  const mongo = await queryMongoCollection('stores');
  // `merchants` is the legacy collection name — merge both so nothing is missed.
  const legacyMongo = await queryMongoCollection('merchants');
  const mongoRows = [...mongo.rows, ...legacyMongo.rows];

  const supa = await querySupabaseTable('merchants');
  const merged = mergeRows(mongoRows, supa.rows);

  return {
    data: merged,
    sources: [
      ...(mongoRows.length ? (['mongodb'] as DataSource[]) : []),
      ...(supa.rows.length ? (['supabase'] as DataSource[]) : []),
    ],
    ok: merged.length > 0,
    mongodb: { ok: !mongo.error, count: mongoRows.length, error: mongo.error || legacyMongo.error },
    supabase: { ok: !supa.error, count: supa.rows.length, error: supa.error },
  };
}

/**
 * Fetch subscription rows. MongoDB holds the operational `subscriptions`
 * collection; Supabase holds the real-time mirror used by auth. Both are read
 * and merged so revenue/count metrics survive either provider being empty.
 */
export async function fetchHybridSubscriptions(): Promise<HybridResult<Record<string, any>>> {
  const mongo = await queryMongoCollection('subscriptions');
  const legacyMongo = await queryMongoCollection('subscription_requests');
  const mongoRows = [...mongo.rows, ...legacyMongo.rows];

  const supa = await querySupabaseTable('subscriptions');
  const merged = mergeRows(mongoRows, supa.rows, (row) =>
    String(pick(row, ['id', '_id', 'subscription_id', 'store_id', 'merchant_id', 'store_slug']) || '').toLowerCase()
  );

  return {
    data: merged,
    sources: [
      ...(mongoRows.length ? (['mongodb'] as DataSource[]) : []),
      ...(supa.rows.length ? (['supabase'] as DataSource[]) : []),
    ],
    ok: merged.length > 0,
    mongodb: { ok: !mongo.error, count: mongoRows.length, error: mongo.error || legacyMongo.error },
    supabase: { ok: !supa.error, count: supa.rows.length, error: supa.error },
  };
}

/**
 * Fetch custom domains. MongoDB stores them per store; Supabase keeps the
 * real-time `domains` table used for resolution. Merged by hostname/slug.
 */
export async function fetchHybridDomains(): Promise<HybridResult<Record<string, any>>> {
  const mongo = await queryMongoCollection('domains');
  const supa = await querySupabaseTable('domains');
  const merged = mergeRows(mongo.rows, supa.rows, (row) =>
    String(pick(row, ['domain', 'hostname', 'host', 'id', 'store_id', 'store_slug']) || '').toLowerCase()
  );

  return {
    data: merged,
    sources: [
      ...(mongo.rows.length ? (['mongodb'] as DataSource[]) : []),
      ...(supa.rows.length ? (['supabase'] as DataSource[]) : []),
    ],
    ok: merged.length > 0,
    mongodb: { ok: !mongo.error, count: mongo.rows.length, error: mongo.error },
    supabase: { ok: !supa.error, count: supa.rows.length, error: supa.error },
  };
}

/**
 * Subscription plan definitions. MongoDB `subscription_plans` is authoritative;
 * the Supabase `subscription_plans` table (and the legacy `plans` table) fill in
 * when Mongo has none, or add plans Mongo does not know about.
 */
export async function fetchHybridPlans(): Promise<HybridResult<Record<string, any>>> {
  const mongo = await queryMongoCollection('subscription_plans');
  const legacyMongo = await queryMongoCollection('plans');
  const mongoRows = [...mongo.rows, ...legacyMongo.rows];

  const supa = await querySupabaseTable('subscription_plans');
  const supaLegacy = await querySupabaseTable('plans');
  const supaRows = [...supa.rows, ...supaLegacy.rows];

  const merged = mergeRows(mongoRows, supaRows, (row) =>
    String(pick(row, ['id', 'plan_id', 'planId', 'slug', 'code', 'name']) || '').toLowerCase()
  );

  return {
    data: merged,
    sources: [
      ...(mongoRows.length ? (['mongodb'] as DataSource[]) : []),
      ...(supaRows.length ? (['supabase'] as DataSource[]) : []),
    ],
    ok: merged.length > 0,
    mongodb: { ok: !mongo.error, count: mongoRows.length, error: mongo.error || legacyMongo.error },
    supabase: { ok: !supa.error, count: supaRows.length, error: supa.error || supaLegacy.error },
  };
}

/**
 * Platform-wide metric COUNTS from Supabase, used to backfill any metric the
 * MongoDB aggregation returned as zero/empty. Returns nulls when unavailable so
 * the caller can keep its Mongo value untouched.
 */
export async function fetchSupabaseMetricFallback(): Promise<{
  merchantCount: number | null;
  subscriptionCount: number | null;
  domainCount: number | null;
  error?: string;
}> {
  const { isConfigured } = getSupabaseServerConfig();
  if (!isConfigured) return { merchantCount: null, subscriptionCount: null, domainCount: null, error: 'Supabase is not configured.' };

  const [merchants, subscriptions, domains] = await Promise.all([
    querySupabaseTable('merchants', { select: 'id', limit: 5000 }),
    querySupabaseTable('subscriptions', { select: 'id', limit: 5000 }),
    querySupabaseTable('domains', { select: 'id', limit: 5000 }),
  ]);

  return {
    merchantCount: merchants.error ? null : merchants.rows.length,
    subscriptionCount: subscriptions.error ? null : subscriptions.rows.length,
    domainCount: domains.error ? null : domains.rows.length,
    error: merchants.error || subscriptions.error || domains.error,
  };
}
