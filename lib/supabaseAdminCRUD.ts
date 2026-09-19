/**
 * Supabase-first, MongoDB-fallback CRUD layer for the Super Admin Portal
 * catalogue tables: subscription plans, themes/templates, platform add-ons.
 *
 * STRATEGY
 * --------
 * Every write (create / update / delete) is attempted on Supabase REST first.
 * If Supabase is unconfigured, times out, or returns a non-2xx that is NOT a
 * 409 conflict, the same mutation is applied to MongoDB so the operational
 * store stays in sync. Reads query both providers and merge the results
 * (Mongo authoritative, Supabase filling gaps), mirroring hybridDb.ts.
 *
 * This keeps the platform online even when one database is degraded — a core
 * requirement of the "automatic Mongo/Fallback redundancy" spec.
 *
 * All exports are import-safe from the Express bootstrap (server.ts), the
 * bundled Vercel app (api/server.ts) and standalone Vercel functions.
 */

import { getMongoDb, getMongoUri, describeMongoError, DB_NAME } from './db.js';
import { getSupabaseServerConfig, querySupabaseTable, queryMongoCollection, mergeRows } from './hybridDb.js';
import type { DataSource, HybridResult } from './hybridDb.js';

/* ────────────────────────── types ────────────────────────── */

export type AdminCatalogEntity = 'subscription_plans' | 'themes_templates' | 'platform_addons';

export interface CatalogWriteResult {
  ok: boolean;
  /** Which provider(s) ended up persisted the record. */
  sources: DataSource[];
  error?: string;
  /** Normalised record written, best-effort. */
  record?: Record<string, any>;
}

export interface CatalogListResult<T = Record<string, any>>
  extends HybridResult<T> {
  /** Total count of the merged set (alias for data.length). */
  total: number;
}

/* ────────────────────────── Supabase REST writes ────────────────────────── */

type SupabaseMethod = 'POST' | 'PATCH' | 'DELETE';

/**
 * Build the Supabase REST headers once for all write verbs.
 * Falls back to the anon key; the service-role key (if present in env) is
 * preferred automatically by getSupabaseServerConfig.
 */
function supabaseHeaders(): Record<string, string> {
  const { supabaseKey } = getSupabaseServerConfig();
  return {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Prefer: 'return=minimal',
  };
}

/**
 * Write (POST / PATCH / DELETE) a single record to a Supabase table via REST.
 *
 * Returns `{ ok, error }`. Never throws — callers decide whether to fall back.
 *
 * @param table    Supabase table name.
 * @param method   POST (upsert by matchColumns), PATCH (update by matchColumns),
 *                 or DELETE (delete by matchColumns).
 * @param record   Payload for POST/PATCH (ignored for DELETE).
 * @param match    Column + value used as the WHERE clause (PATCH/DELETE only).
 *                 When omitted for POST, `Prefer: resolution=merge-duplicates`
 *                 lets Supabase upsert by primary key.
 */
export async function writeSupabaseRecord(
  table: string,
  method: SupabaseMethod,
  record: Record<string, any> = {},
  match?: { column: string; value: string }
): Promise<{ ok: boolean; error?: string; statusCode?: number }> {
  const { supabaseUrl, isConfigured } = getSupabaseServerConfig();
  if (!isConfigured) return { ok: false, error: 'Supabase is not configured.' };

  const headers = supabaseHeaders();
  let url = `${supabaseUrl}/rest/v1/${table}`;

  if (method === 'DELETE' || method === 'PATCH') {
    if (match) {
      const params = new URLSearchParams();
      params.set(match.column, `eq.${encodeURIComponent(String(match.value))}`);
      if (method === 'PATCH') params.set('select', 'false');
      url += `?${params.toString()}`;
    }
  }

  const body = method === 'DELETE' ? undefined : JSON.stringify(record);

  try {
    const res = await fetch(url, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
    });

    if (res.ok) return { ok: true, statusCode: res.status };
    // 409 = conflict (duplicate key). Caller can decide to retry or warn.
    return { ok: false, error: `Supabase ${table} ${method} responded ${res.status}`, statusCode: res.status };
  } catch (err: any) {
    return { ok: false, error: err?.message || `Supabase ${table} ${method} failed` };
  }
}

/**
 * Upsert (insert-or-update) a record into Supabase by a natural key.
 * Uses PATCH-with-where so the caller controls which column is the conflict
 * target, avoiding ambiguous duplicate-key semantics.
 */
export async function upsertSupabaseRecord(
  table: string,
  record: Record<string, any>,
  matchColumn: string
): Promise<{ ok: boolean; error?: string; statusCode?: number }> {
  const matchValue = String(record[matchColumn] || record.id || record.slug || '');
  if (!matchValue) {
    // No natural key → just insert.
    return writeSupabaseRecord(table, 'POST', record);
  }

  // Try an UPDATE first; if 0 rows matched, fall back to INSERT.
  const updateResult = await writeSupabaseRecord(table, 'PATCH', record, {
    column: matchColumn,
    value: matchValue,
  });

  if (updateResult.ok) return updateResult;
  // If the PATCH matched nothing (Supabase returns 204 even when 0 rows updated,
  // so we can't distinguish "no match" from "ok" by status alone). Insert anyway
  // as a fallback when PATCH errored with a non-2xx.
  if (updateResult.statusCode && updateResult.statusCode >= 400 && updateResult.statusCode < 500) {
    return writeSupabaseRecord(table, 'POST', record);
  }
  return updateResult;
}

/* ────────────────────────── MongoDB fallback writes ─�───────────────────────── */

async function safeMongoDb() {
  if (!getMongoUri()) return { db: null, error: describeMongoError(new Error('MONGODB_URI is not set')).message };
  try {
    const db = await getMongoDb(DB_NAME);
    return db ? { db } : { db: null, error: 'MongoDB connection handle unavailable.' };
  } catch (err: any) {
    return { db: null, error: describeMongoError(err).message };
  }
}

/**
 * Upsert a record into a Mongo collection by a natural key. The _id is set to
 * the record's `id`/`slug` when available so repeated calls are idempotent.
 */
export async function upsertMongoRecord(
  collection: string,
  record: Record<string, any>,
  matchColumn: string
): Promise<{ ok: boolean; error?: string; matched: boolean }> {
  const { db, error } = await safeMongoDb();
  if (!db) return { ok: false, error, matched: false };

  const matchValue = String(record[matchColumn] || record.id || record.slug || '');
  const filter = matchValue
    ? { [matchColumn]: matchValue }
    : { _id: record._id || record.id || undefined };

  try {
    if (matchValue) {
      const existing = await db.collection(collection).findOne(filter);
      if (existing) {
        await db.collection(collection).updateOne(filter, { $set: record });
        return { ok: true, matched: true };
      }
    }
    await db.collection(collection).insertOne(record);
    return { ok: true, matched: false };
  } catch (err: any) {
    // Duplicate-key race → it's an upsert, treat as success.
    if (/E11000|duplicate key/i.test(String(err?.message || ''))) {
      return { ok: true, matched: true };
    }
    return { ok: false, error: err?.message || 'MongoDB write failed', matched: false };
  }
}

/**
 * Delete a record from a Mongo collection by natural key.
 */
export async function deleteMongoRecord(
  collection: string,
  matchColumn: string,
  matchValue: string
): Promise<{ ok: boolean; deleted: number; error?: string }> {
  const { db, error } = await safeMongoDb();
  if (!db) return { ok: false, deleted: 0, error };

  try {
    const res = await db
      .collection(collection)
      .deleteMany({ [matchColumn]: String(matchValue) });
    return { ok: true, deleted: res?.deletedCount || 0 };
  } catch (err: any) {
    return { ok: false, deleted: 0, error: err?.message || 'MongoDB delete failed' };
  }
}

/* ────────────────────────── Supabase table → Mongo collection map ────────────────────────── */

/** Map each Supabase table to its primary Mongo collection + legacy alias. */
const COLLECTION_MAP: Record<AdminCatalogEntity, { supabase: string; mongo: string[]; matchColumn: string }> = {
  subscription_plans: {
    supabase: 'subscription_plans',
    mongo: ['subscription_plans', 'plans'],
    matchColumn: 'slug',
  },
  themes_templates: {
    supabase: 'themes_templates',
    mongo: ['themes', 'theme_requests'],
    matchColumn: 'slug',
  },
  platform_addons: {
    supabase: 'platform_addons',
    mongo: ['platform_addons', 'addons'],
    matchColumn: 'slug',
  },
};

/* ────────────────────────── normalised identity ────────────────────────── */

/**
 * Normalised identity key shared across providers for catalog entities.
 * Prefers a slug (human-stable), then `id`. Mongo's `_id` is excluded.
 */
export function catalogIdentity(row: Record<string, any>): string {
  const slugish = row?.slug || row?.code;
  if (slugish !== undefined && slugish !== null && slugish !== '') {
    return String(slugish).trim().toLowerCase();
  }
  return String(row?.id || '').trim().toLowerCase();
}

/* ────────────────────────── high-level hybrid reads ────────────────────────── */

/**
 * Fetch a catalog entity from Supabase (primary) merged with MongoDB rows.
 *
 * Supabase is tried first; when it returns rows, Mongo fills only the gaps
 * (entities neither provider would duplicate). When Supabase is unavailable,
 * Mongo alone answers — guaranteeing the admin UI is never empty.
 */
export async function fetchHybridCatalog(
  entity: AdminCatalogEntity
): Promise<CatalogListResult> {
  const map = COLLECTION_MAP[entity];

  // ── Supabase (primary) ──
  const [supaMain, supaLegacy] = await Promise.all([
    querySupabaseTable(map.supabase),
    entity === 'subscription_plans'
      ? querySupabaseTable('plans')
      : Promise.resolve<{ rows: Record<string, any>[]; error?: string }>({ rows: [] }),
  ]);
  const supabaseRows = [...supaMain.rows, ...supaLegacy.rows];

  // ── Mongo (secondary / fallback) ──
  const mongoRows: Record<string, any>[] = [];
  for (const coll of map.mongo) {
    const result = await queryMongoCollection(coll);
    for (const row of result.rows) mongoRows.push(row);
  }

  const merged = mergeRows(supabaseRows, mongoRows, catalogIdentity);

  return {
    data: merged,
    total: merged.length,
    sources: [
      ...(supabaseRows.length ? (['supabase'] as DataSource[]) : []),
      ...(mongoRows.length ? (['mongodb'] as DataSource[]) : []),
    ],
    ok: merged.length > 0,
    mongodb: { ok: !mongoRows.length || true, count: mongoRows.length, error: undefined },
    supabase: { ok: !supaMain.error, count: supabaseRows.length, error: supaMain.error || supaLegacy.error },
  };
}

/* ────────────────────────── high-level hybrid writes ────────────────────────── */

/**
 * Create (or upsert) a catalog entity across BOTH providers.
 *
 * Tries Supabase first; if Supabase fails (unconfigured, timeout, or a 4xx
 * that is not a conflict), writes to MongoDB so the record is never lost.
 */
export async function createCatalogEntity(
  entity: AdminCatalogEntity,
  record: Record<string, any>
): Promise<CatalogWriteResult> {
  const map = COLLECTION_MAP[entity];
  const sources: DataSource[] = [];

  // 1. Try Supabase first.
  const sb = await upsertSupabaseRecord(map.supabase, record, map.matchColumn);
  if (sb.ok) {
    sources.push('supabase');
  } else if (sb.statusCode && sb.statusCode >= 400 && sb.statusCode < 500) {
    // A 4xx like 404 (table missing) or 409 (conflict) is a real failure —
    // fall through to MongoDB so the write is not lost.
    console.warn(`[supabaseAdminCRUD] ${entity} Supabase write non-2xx:`, sb.statusCode, sb.error);
  } else if (!sb.ok && !getSupabaseServerConfig().isConfigured) {
    // Supabase simply not configured — expected, go straight to Mongo.
  } else {
    console.warn(`[supabaseAdminCRUD] ${entity} Supabase write error:`, sb.error);
  }

  // 2. Mirror to MongoDB (fallback OR redundancy).
  const mongoResult = await upsertMongoRecord(map.mongo[0], record, map.matchColumn);
  if (mongoResult.ok) {
    sources.push('mongodb');
  } else {
    console.warn(`[supabaseAdminCRUD] ${entity} MongoDB fallback write error:`, mongoResult.error);
  }

  const ok = sources.length > 0;
  return {
    ok,
    sources,
    error: ok ? undefined : `Failed to write ${entity} to any provider.`,
    record,
  };
}

/**
 * Update a catalog entity across BOTH providers.
 */
export async function updateCatalogEntity(
  entity: AdminCatalogEntity,
  ref: string,
  record: Record<string, any>
): Promise<CatalogWriteResult> {
  const map = COLLECTION_MAP[entity];
  const sources: DataSource[] = [];

  const sb = await writeSupabaseRecord(map.supabase, 'PATCH', record, {
    column: map.matchColumn,
    value: ref,
  });
  if (sb.ok) sources.push('supabase');
  else console.warn(`[supabaseAdminCRUD] ${entity} Supabase update error:`, sb.error);

  // Also patch by id in case the natural-key column differs.
  await writeSupabaseRecord(map.supabase, 'PATCH', record, { column: 'id', value: ref });

  const mongoResult = await upsertMongoRecord(map.mongo[0], { ...record, [map.matchColumn]: ref }, map.matchColumn);
  if (mongoResult.ok) sources.push('mongodb');
  else console.warn(`[supabaseAdminCRUD] ${entity} MongoDB update error:`, mongoResult.error);

  const ok = sources.length > 0;
  return {
    ok,
    sources,
    error: ok ? undefined : `Failed to update ${entity} in any provider.`,
    record,
  };
}

/**
 * Delete a catalog entity across BOTH providers.
 */
export async function deleteCatalogEntity(
  entity: AdminCatalogEntity,
  ref: string
): Promise<{ ok: boolean; sources: DataSource[]; deleted: number; error?: string }> {
  const map = COLLECTION_MAP[entity];
  const sources: DataSource[] = [];
  let deleted = 0;

  const sb = await writeSupabaseRecord(map.supabase, 'DELETE', {}, {
    column: map.matchColumn,
    value: ref,
  });
  if (sb.ok) sources.push('supabase');
  else console.warn(`[supabaseAdminCRUD] ${entity} Supabase delete error:`, sb.error);

  for (const coll of map.mongo) {
    const mongoResult = await deleteMongoRecord(coll, map.matchColumn, ref);
    if (mongoResult.ok && mongoResult.deleted > 0) {
      sources.push('mongodb');
      deleted += mongoResult.deleted;
    }
  }

  const ok = sources.length > 0;
  return {
    ok,
    sources,
    deleted,
    error: ok ? undefined : `Failed to delete ${entity} from any provider.`,
  };
}

/* ────────────────────────── per-entity convenience wrappers ────────────────────────── */

export const fetchHybridThemes = () => fetchHybridCatalog('themes_templates');
export const fetchHybridAddons = () => fetchHybridCatalog('platform_addons');
export const fetchHybridPlans = () => fetchHybridCatalog('subscription_plans');

export const supabasePlans = {
  list: () => fetchHybridCatalog('subscription_plans'),
  create: (rec: Record<string, any>) => createCatalogEntity('subscription_plans', rec),
  update: (ref: string, rec: Record<string, any>) => updateCatalogEntity('subscription_plans', ref, rec),
  delete: (ref: string) => deleteCatalogEntity('subscription_plans', ref),
};

export const supabaseThemes = {
  list: () => fetchHybridCatalog('themes_templates'),
  create: (rec: Record<string, any>) => createCatalogEntity('themes_templates', rec),
  update: (ref: string, rec: Record<string, any>) => updateCatalogEntity('themes_templates', ref, rec),
  delete: (ref: string) => deleteCatalogEntity('themes_templates', ref),
};

export const supabaseAddons = {
  list: () => fetchHybridCatalog('platform_addons'),
  create: (rec: Record<string, any>) => createCatalogEntity('platform_addons', rec),
  update: (ref: string, rec: Record<string, any>) => updateCatalogEntity('platform_addons', ref, rec),
  delete: (ref: string) => deleteCatalogEntity('platform_addons', ref),
};

export default {
  fetchHybridCatalog,
  createCatalogEntity,
  updateCatalogEntity,
  deleteCatalogEntity,
  supabasePlans,
  supabaseThemes,
  supabaseAddons,
};
