/**
 * Support & Communication persistence for the Super Admin portal.
 *
 * STRATEGY (matches lib/platformConfig.ts and lib/supabaseAdminCRUD.ts)
 * ---------------------------------------------------------------------
 * The "Support & Communication" module stores three surfaces:
 *
 *   1. support_tickets   — merchant tickets + their message history.
 *   2. broadcast_history — mass broadcast (App + Email) delivery records.
 *   3. platformAnnouncement — the Global Notice Banner config, persisted inside
 *      the existing `platform_config` singleton (config_key='platform') so it is
 *      shared with every online merchant in real time.
 *
 * Every write goes to Supabase FIRST (the canonical store) and is mirrored to
 * MongoDB (fallback AND redundancy), so a write survives either provider being
 * degraded. Reads query BOTH and merge, newest first.
 *
 * All functions are best-effort and NEVER throw: callers always get a shaped
 * result (`{ ok, data, sources, error, diagnostics }`).
 *
 * Import-safe from the Express bootstrap (server.ts) and the Vercel app.
 */

import { getMongoDb, getMongoUri, describeMongoError, DB_NAME } from './db.js';
import { getSupabaseServerConfig, querySupabaseTable, queryMongoCollection } from './hybridDb.js';
import type { DataSource } from './hybridDb.js';
import { readPlatformConfig, writePlatformConfig } from './platformConfig.js';
import { cacheUpsert, cacheRows, cacheLastError, RUNTIME_CACHE_WARNING } from './runtimeCache.js';

/* ────────────────────────── result envelope ────────────────────────── */

export interface CommsResult<T = Record<string, any>> {
  ok: boolean;
  data: T | null;
  sources: DataSource[];
  error?: string;
  /** Set when the write only reached the runtime cache, never a database. */
  warning?: string;
  /** True when the returned data came (partly) from the runtime cache. */
  fromCache?: boolean;
  diagnostics?: Record<string, any>;
}

/* ────────────────────────── Supabase REST helpers ────────────────────────── */

async function writeSupabaseRow(
  table: string,
  record: Record<string, any>,
  matchColumn = 'id'
): Promise<{ ok: boolean; error?: string; statusCode?: number }> {
  const { supabaseUrl, supabaseKey, isConfigured } = getSupabaseServerConfig();
  if (!isConfigured) return { ok: false, error: 'Supabase is not configured.' };

  const headers: Record<string, string> = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  };

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/${table}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(record),
        signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
      }
    );
    if (res.ok) return { ok: true, statusCode: res.status };
    return { ok: false, error: `Supabase ${table} responded ${res.status}`, statusCode: res.status };
  } catch (err: any) {
    return { ok: false, error: err?.message || `Supabase ${table} write failed` };
  }
}

/* ────────────────────────── MongoDB helpers ────────────────────────── */

async function safeMongoDb() {
  if (!getMongoUri()) return { db: null, error: describeMongoError(new Error('MONGODB_URI is not set')).message };
  try {
    const db = await getMongoDb(DB_NAME);
    return db ? { db } : { db: null, error: 'MongoDB connection handle unavailable.' };
  } catch (err: any) {
    return { db: null, error: describeMongoError(err).message };
  }
}

/** Upsert one document in Mongo keyed by `id`. */
async function upsertMongoById(
  collection: string,
  record: Record<string, any>
): Promise<{ ok: boolean; error?: string }> {
  const { db, error } = await safeMongoDb();
  if (!db) return { ok: false, error };

  const id = String(record.id || '');
  if (!id) return { ok: false, error: 'Record id is required.' };

  const now = new Date().toISOString();
  // Strip `_id` (immutable) and the created-* fields before building the update.
  // A record that was read back from Mongo already carries `createdAt`, and
  // listing the same path in BOTH `$set` and `$setOnInsert` makes MongoDB reject
  // the write with "Updating the path 'createdAt' would create a conflict".
  const {
    _id: _ignored,
    createdAt: _createdAt,
    created_at: _created_at,
    ...rest
  } = record;

  const createdAt = record.createdAt || record.created_at || now;
  const doc = { ...rest, updated_at: now, updatedAt: now };

  try {
    await db.collection(collection).updateOne(
      { id },
      {
        $set: doc,
        $setOnInsert: { created_at: createdAt, createdAt },
      },
      { upsert: true }
    );
    return { ok: true };
  } catch (err: any) {
    if (/E11000|duplicate key/i.test(String(err?.message || ''))) return { ok: true };
    return { ok: false, error: err?.message || 'MongoDB write failed' };
  }
}

/* ────────────────────────── normalisers ────────────────────────── */

/** Kebab-case a string for use as a fallback id. */
function safeId(value: any, prefix: string): string {
  const raw = String(value ?? '').trim();
  if (raw) return raw;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Normalise a stored ticket row (Supabase columns, Mongo doc, or UI shape). */
export function normalizeTicket(row: Record<string, any>): Record<string, any> {
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  const messages = Array.isArray(row?.messages)
    ? row.messages
    : Array.isArray(payload?.messages)
      ? payload.messages
      : [];
  return {
    id: String(row?.id || payload?.id || safeId(undefined, 'ticket')),
    storeName: String(row?.store_name || row?.storeName || payload?.storeName || 'Merchant Store'),
    merchantEmail: String(row?.merchant_email || row?.merchantEmail || payload?.merchantEmail || ''),
    subject: String(row?.subject || payload?.subject || '(No subject)'),
    category: (row?.category || payload?.category || 'General'),
    priority: (row?.priority || payload?.priority || 'Medium'),
    status: (row?.status || payload?.status || 'Open'),
    createdAt: String(row?.created_at || row?.createdAt || payload?.createdAt || new Date().toISOString()),
    messages,
  };
}

/** Normalise a stored broadcast row. */
export function normalizeBroadcast(row: Record<string, any>): Record<string, any> {
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  const actionUrl = String(
    row?.actionUrl || row?.action_url || row?.actionLink || payload?.actionUrl || ''
  ).trim();
  return {
    id: String(row?.id || payload?.id || safeId(undefined, 'bc')),
    timestamp: String(row?.timestamp || row?.created_at || row?.createdAt || payload?.timestamp || new Date().toISOString()),
    audience: (row?.audience || payload?.audience || 'All Merchants'),
    subject: String(row?.subject || payload?.subject || ''),
    type: (row?.type || payload?.type || 'Both'),
    body: String(row?.body || payload?.body || ''),
    message: row?.message || payload?.message,
    status: (row?.status || payload?.status || 'Delivered'),
    actionUrl: actionUrl || undefined,
  };
}

/* ────────────────────────── support tickets ────────────────────────── */

/**
 * Read every support ticket from Supabase + MongoDB, merged by id and ordered
 * newest-first. Never throws.
 */
export async function readSupportTickets(): Promise<CommsResult<Record<string, any>[]>> {
  const [supa, mongo] = await Promise.all([
    querySupabaseTable<Record<string, any>>('support_tickets', { limit: 1000 }),
    queryMongoCollection<Record<string, any>>('support_tickets', {}, { limit: 1000 }),
  ]);

  const byId = new Map<string, Record<string, any>>();
  // Supabase is authoritative: process Mongo first so Supabase wins on conflict.
  for (const row of [...mongo.rows, ...supa.rows]) {
    const ticket = normalizeTicket(row);
    byId.set(ticket.id, { ...(byId.get(ticket.id) || {}), ...ticket });
  }

  const tickets = [...byId.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const sources: DataSource[] = [];
  if (supa.rows.length) sources.push('supabase');
  if (mongo.rows.length) sources.push('mongodb');

  return {
    ok: true,
    data: tickets,
    sources,
    error: supa.error || mongo.error,
    diagnostics: {
      supabase: { ok: !supa.error, count: supa.rows.length, error: supa.error },
      mongodb: { ok: !mongo.error, count: mongo.rows.length, error: mongo.error },
    },
  };
}

/** Upsert a single support ticket to BOTH providers. Never throws. */
export async function writeSupportTicket(raw: Record<string, any>): Promise<CommsResult<Record<string, any>>> {
  const ticket = normalizeTicket(raw);
  const sources: DataSource[] = [];
  const now = new Date().toISOString();

  // Supabase columns + full JSONB payload so nothing is lost.
  const sb = await writeSupabaseRow('support_tickets', {
    id: ticket.id,
    store_name: ticket.storeName,
    merchant_email: ticket.merchantEmail,
    subject: ticket.subject,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    messages: ticket.messages,
    payload: ticket,
    created_at: ticket.createdAt,
    updated_at: now,
  }, 'id');
  if (sb.ok) sources.push('supabase');
  else console.warn('[supportComms] support_tickets Supabase write warning:', sb.error);

  const mongo = await upsertMongoById('support_tickets', ticket);
  if (mongo.ok) sources.push('mongodb');
  else console.warn('[supportComms] support_tickets Mongo write warning:', mongo.error);

  return {
    ok: sources.length > 0,
    data: ticket,
    sources,
    error: sources.length ? undefined : 'Failed to persist support ticket to any provider.',
  };
}

/* ────────────────────────── broadcast history ────────────────────────── */

/**
 * Read the mass-broadcast history from Supabase + MongoDB, newest-first.
 *
 * The runtime cache is merged in LAST so a database row always wins on
 * conflict; the cache only supplies broadcasts the databases rejected.
 */
export async function readBroadcastHistory(): Promise<CommsResult<Record<string, any>[]>> {
  const [supa, mongo] = await Promise.all([
    querySupabaseTable<Record<string, any>>('broadcast_history', { limit: 1000 }),
    queryMongoCollection<Record<string, any>>('broadcast_history', {}, { limit: 1000 }),
  ]);

  const cached = cacheRows('broadcast_history');

  const byId = new Map<string, Record<string, any>>();
  for (const row of [...mongo.rows, ...supa.rows, ...cached]) {
    const bc = normalizeBroadcast(row);
    byId.set(bc.id, { ...(byId.get(bc.id) || {}), ...bc });
  }

  const history = [...byId.values()].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const sources: DataSource[] = [];
  if (supa.rows.length) sources.push('supabase');
  if (mongo.rows.length) sources.push('mongodb');

  const dbIds = new Set([...mongo.rows, ...supa.rows].map((row) => String(row?.id || '')));
  const usedCache = cached.some((row) => !dbIds.has(String(row?.id || '')));
  if (usedCache) sources.push('runtime');

  return {
    ok: true,
    data: history,
    sources,
    fromCache: usedCache,
    warning: usedCache ? RUNTIME_CACHE_WARNING : undefined,
    error: supa.error || mongo.error || (usedCache ? cacheLastError('broadcast_history') : undefined),
    diagnostics: {
      supabase: { ok: !supa.error, count: supa.rows.length, error: supa.error },
      mongodb: { ok: !mongo.error, count: mongo.rows.length, error: mongo.error },
      runtime: { ok: true, count: cached.length },
    },
  };
}

/**
 * Append a single mass broadcast to BOTH providers. Never throws.
 *
 * If neither database accepts the row (expired credentials, an unreachable
 * cluster, a missing table) the broadcast is retained in the runtime cache so
 * the merchant bell still receives it, and the result carries a `warning`
 * telling the caller it was only cached — never a silent success.
 */
export async function writeBroadcast(raw: Record<string, any>): Promise<CommsResult<Record<string, any>>> {
  const bc = normalizeBroadcast(raw);
  const sources: DataSource[] = [];
  const failures: string[] = [];
  const now = new Date().toISOString();

  try {
    const sb = await writeSupabaseRow('broadcast_history', {
      id: bc.id,
      timestamp: bc.timestamp,
      audience: bc.audience,
      subject: bc.subject,
      type: bc.type,
      body: bc.body,
      status: bc.status,
      action_url: bc.actionUrl,
      payload: bc,
      updated_at: now,
    }, 'id');
    if (sb.ok) sources.push('supabase');
    else {
      failures.push(`supabase: ${sb.error || 'write failed'}`);
      console.warn('[supportComms] broadcast_history Supabase write warning:', sb.error);
    }
  } catch (err: any) {
    failures.push(`supabase: ${err?.message || err}`);
    console.warn('[supportComms] broadcast_history Supabase write threw:', err?.message || err);
  }

  try {
    const mongo = await upsertMongoById('broadcast_history', bc);
    if (mongo.ok) sources.push('mongodb');
    else {
      failures.push(`mongodb: ${mongo.error || 'write failed'}`);
      console.warn('[supportComms] broadcast_history Mongo write warning:', mongo.error);
    }
  } catch (err: any) {
    failures.push(`mongodb: ${err?.message || err}`);
    console.warn('[supportComms] broadcast_history Mongo write threw:', err?.message || err);
  }

  // Degraded mode: keep the broadcast in-process so the bell still lights up.
  if (sources.length === 0) {
    const reason = failures.join(' | ') || 'no provider available';
    cacheUpsert('broadcast_history', bc, reason);
    sources.push('runtime');
    return {
      ok: true,
      data: bc,
      sources,
      warning: RUNTIME_CACHE_WARNING,
      fromCache: true,
      error: reason,
    };
  }

  return {
    ok: true,
    data: bc,
    sources,
  };
}

/* ────────────────────────── global notice banner ────────────────────────── */

/**
 * Read the Global Notice Banner config. It lives inside the composite
 * `platform_config` document (config_key='platform') under `platformAnnouncement`
 * so the very same singleton the merchant dashboard reads carries it.
 */
export async function readAnnouncement(): Promise<CommsResult<Record<string, any>>> {
  const config = await readPlatformConfig();
  const announcement =
    config.data && typeof config.data.platformAnnouncement === 'object'
      ? config.data.platformAnnouncement
      : null;

  return {
    ok: Boolean(announcement),
    data: announcement,
    sources: config.sources,
    error: config.error,
    diagnostics: config.diagnostics,
  };
}

/**
 * Persist the Global Notice Banner config into the composite platform document.
 * Merges with the existing config so gateways/settings/automation survive.
 */
export async function writeAnnouncement(
  announcement: Record<string, any>
): Promise<CommsResult<Record<string, any>>> {
  const existing = await readPlatformConfig();
  const current = existing.data && typeof existing.data === 'object' ? existing.data : {};
  const payload = {
    ...current,
    platformAnnouncement: {
      ...(current.platformAnnouncement || {}),
      ...announcement,
    },
  };

  const result = await writePlatformConfig(payload);
  return {
    ok: result.ok,
    data: payload.platformAnnouncement,
    sources: result.sources,
    error: result.error,
  };
}

export default {
  readSupportTickets,
  writeSupportTicket,
  readBroadcastHistory,
  writeBroadcast,
  readAnnouncement,
  writeAnnouncement,
  normalizeTicket,
  normalizeBroadcast,
};
