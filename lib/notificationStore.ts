/**
 * Merchant notification persistence.
 *
 * STRATEGY
 * --------
 * One document per notification in MongoDB `notifications`, mirrored to the
 * Supabase `notifications` table when Supabase is configured (same
 * Supabase-first-then-Mongo convention as lib/supportComms.ts, so a write
 * survives either provider being degraded). Reads merge both by id.
 *
 * WHO A NOTIFICATION IS FOR
 * -------------------------
 * A notification is addressed either to EVERY merchant (`targetAudience: 'all'`)
 * or to specific ones (`targetAudience: 'specific'` + `merchantId`). An optional
 * `audienceFilter` narrows an all-merchants send to one plan cohort
 * ('free_trial' | 'paid') so the existing Super Admin "Broadcast & Emails"
 * audience picker (All Merchants / Free Trial Users / Paid Subscriptions) keeps
 * working without ever needing to enumerate every store id at send time.
 *
 * READ STATE — WHY THERE IS ALSO A `readBy` MAP
 * ---------------------------------------------
 * The obvious design is a single `isRead` boolean, and for a notification sent
 * to ONE merchant that is exactly right. It is wrong for a broadcast: one shared
 * boolean means the first merchant to click it silently marks it read for
 * everyone else, so every other merchant's badge would drop to zero unread
 * because a *different* store opened the popup.
 *
 * So read state is stored per merchant:
 *   • `targetAudience: 'specific'` → `isRead` on the document is the truth.
 *   • `targetAudience: 'all'`       → `readBy[merchantKey]` is the truth and
 *     `isRead` stays false permanently.
 * Both are normalised into one `isRead` boolean on the way out by
 * `normalizeNotification`, so the client only ever sees a simple flag and never
 * has to know which storage shape it came from.
 *
 * `merchantKey` is the canonical `storeId` when known, falling back to the
 * store slug, lower-cased — see `readStateKeyFor`.
 *
 * All functions are best-effort and NEVER throw: callers always get a shaped
 * result (`{ ok, data, sources, error }`), matching lib/supportComms.ts.
 *
 * Import-safe from the Express bootstrap and the Vercel app.
 */

import { getMongoDb, getMongoUri, describeMongoError, DB_NAME } from './db.js';
import { queryMongoCollection, querySupabaseTable } from './hybridDb.js';
import type { DataSource } from './hybridDb.js';

/* ────────────────────────── types ────────────────────────── */

export type NotificationTargetAudience = 'all' | 'specific';
export type NotificationAudienceFilter = 'all' | 'free_trial' | 'paid';
export type NotificationKind = 'info' | 'warning' | 'success' | 'broadcast';

export interface MerchantNotification {
  id: string;
  targetAudience: NotificationTargetAudience;
  /** Store identity when `targetAudience === 'specific'`. */
  merchantId: string;
  /**
   * Every spelling this merchant is known by (uuid, slug, code). A send that
   * addresses a store by slug must still be found by a read that only has the
   * uuid, so both sides fan out to the same alias set.
   */
  merchantAliases: string[];
  title: string;
  message: string;
  type: NotificationKind;
  createdAt: string;
  /** Only authoritative for `targetAudience === 'specific'`. */
  isRead: boolean;
  /** Per-merchant read receipts for audience-wide sends. */
  readBy: Record<string, boolean>;
  /** Optional plan-cohort narrowing for an all-merchants send. */
  audienceFilter: NotificationAudienceFilter;
  /** Free-form provenance, e.g. the originating broadcast id. */
  meta: Record<string, any>;
}

export interface NotificationResult<T = any> {
  ok: boolean;
  data: T | null;
  sources: DataSource[];
  error?: string;
}

const COLLECTION = 'notifications';

/* ────────────────────────── Mongo helpers ────────────────────────── */

async function safeMongoDb() {
  if (!getMongoUri()) return { db: null, error: describeMongoError(new Error('MONGODB_URI is not set')).message };
  try {
    const db = await getMongoDb(DB_NAME);
    return db ? { db } : { db: null, error: 'MongoDB connection handle unavailable.' };
  } catch (err: any) {
    return { db: null, error: describeMongoError(err).message };
  }
}

/** Upsert one notification document keyed by `id`. */
async function upsertMongoById(
  collection: string,
  record: Record<string, any>
): Promise<{ ok: boolean; error?: string }> {
  const { db, error } = await safeMongoDb();
  if (!db) return { ok: false, error };

  const id = String(record.id || '');
  if (!id) return { ok: false, error: 'Notification id is required.' };

  const now = new Date().toISOString();
  // `_id` is stripped: upserting it back would attempt to overwrite an
  // immutable Mongo identifier.
  const { _id: _ignored, ...doc } = record;
  try {
    await db.collection(collection).updateOne(
      { id },
      { $set: { ...doc, updated_at: now, updatedAt: now }, $setOnInsert: { created_at: now, createdAt: now } },
      { upsert: true }
    );
    return { ok: true };
  } catch (err: any) {
    if (/E11000|duplicate key/i.test(String(err?.message || ''))) return { ok: true };
    return { ok: false, error: err?.message || 'MongoDB write failed' };
  }
}

/** Best-effort index so the bell read stays fast as history grows. */
async function ensureIndexes(): Promise<void> {
  const { db } = await safeMongoDb();
  if (!db) return;
  try {
    await db.collection(COLLECTION).createIndex({ id: 1 }, { unique: true, name: 'uniq_notification_id' });
    await db.collection(COLLECTION).createIndex({ createdAt: -1 }, { name: 'notification_recent' });
    await db.collection(COLLECTION).createIndex({ merchantId: 1 }, { name: 'notification_merchant' });
  } catch (indexErr: any) {
    console.warn('[notificationStore] index creation skipped:', indexErr?.message || indexErr);
  }
}

/* ────────────────────────── Supabase mirror ────────────────────────── */

async function writeSupabaseRow(record: Record<string, any>): Promise<{ ok: boolean; error?: string }> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !supabaseKey) return { ok: false, error: 'Supabase is not configured.' };

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/${COLLECTION}`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(record),
      signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: `Supabase ${COLLECTION} responded ${res.status}` };
  } catch (err: any) {
    return { ok: false, error: err?.message || `Supabase ${COLLECTION} write failed` };
  }
}

/* ────────────────────────── normalisers ────────────────────────── */

/** Kebab-case id generator, matching lib/supportComms.ts `safeId`. */
function safeId(value: any, prefix: string): string {
  const raw = String(value ?? '').trim();
  if (raw) return raw;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Coerce to a clean, lower-cased, de-duplicated alias list. */
function normalizeAliases(raw: any): string[] {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out: string[] = [];
  for (const entry of list) {
    const value = String(entry ?? '').split(':')[0].trim().toLowerCase();
    if (value && !out.includes(value)) out.push(value);
  }
  return out;
}

/**
 * Normalise a stored notification row. `readKey` is the calling merchant's
 * identity; when supplied, `isRead` is resolved FOR THAT MERCHANT rather than
 * returning the document's shared flag.
 */
export function normalizeNotification(
  row: Record<string, any>,
  readKey?: string
): MerchantNotification {
  const targetAudience: NotificationTargetAudience =
    String(row?.targetAudience || row?.target_audience || '').toLowerCase() === 'specific'
      ? 'specific'
      : 'all';

  const readByRaw = row?.readBy || row?.read_by || {};
  const readBy: Record<string, boolean> = {};
  if (readByRaw && typeof readByRaw === 'object') {
    for (const [key, value] of Object.entries(readByRaw)) {
      const clean = String(key || '').trim().toLowerCase();
      if (clean) readBy[clean] = Boolean(value);
    }
  }

  const key = String(readKey || '').trim().toLowerCase();
  const isRead = key
    ? targetAudience === 'specific'
      ? Boolean(row?.isRead ?? row?.is_read)
      : Boolean(readBy[key])
    : Boolean(row?.isRead ?? row?.is_read);

  const audienceFilterRaw = String(
    row?.audienceFilter || row?.audience_filter || 'all'
  ).toLowerCase();
  const audienceFilter: NotificationAudienceFilter =
    audienceFilterRaw === 'free_trial' || audienceFilterRaw === 'paid'
      ? (audienceFilterRaw as NotificationAudienceFilter)
      : 'all';

  const rawType = String(row?.type || 'info').toLowerCase();
  const type: NotificationKind =
    rawType === 'warning' || rawType === 'success' || rawType === 'broadcast'
      ? (rawType as NotificationKind)
      : 'info';

  return {
    id: String(row?.id || safeId(undefined, 'ntf')),
    targetAudience,
    merchantId: String(row?.merchantId || row?.merchant_id || ''),
    merchantAliases: normalizeAliases(row?.merchantAliases || row?.merchant_aliases),
    title: String(row?.title || row?.subject || '(No subject)'),
    message: String(row?.message || row?.body || row?.desc || ''),
    type,
    createdAt: String(row?.createdAt || row?.created_at || new Date().toISOString()),
    isRead,
    readBy,
    audienceFilter,
    meta: row?.meta && typeof row.meta === 'object' ? row.meta : {},
  };
}

/** True when the merchant's plan is in the notification's target cohort. */
export function matchesAudienceFilter(
  notification: Pick<MerchantNotification, 'audienceFilter'>,
  planId: string
): boolean {
  const filter = notification.audienceFilter || 'all';
  if (filter === 'all') return true;
  const plan = String(planId || '').trim().toLowerCase();
  const onTrial = !plan || plan === 'free_trial' || plan === 'trial';
  return filter === 'free_trial' ? onTrial : !onTrial;
}

/** Does this notification belong to the merchant described by `aliases`? */
export function isAddressedToMerchant(
  notification: Pick<MerchantNotification, 'targetAudience' | 'merchantId' | 'merchantAliases'>,
  aliases: string[]
): boolean {
  if (notification.targetAudience === 'all') return true;
  const mine = normalizeAliases(aliases);
  if (!mine.length) return false;
  const theirs = normalizeAliases([notification.merchantId, ...(notification.merchantAliases || [])]);
  return mine.some((alias) => theirs.includes(alias));
}

/* ────────────────────────── reads ────────────────────────── */

/**
 * Every notification addressed to the merchant described by `aliases`,
 * newest-first, each with `isRead` resolved for that merchant.
 */
export async function readNotificationsForMerchant(
  aliases: string[],
  options: { limit?: number; planId?: string } = {}
): Promise<NotificationResult<MerchantNotification[]>> {
  const mine = normalizeAliases(aliases);
  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 200);

  // Mongo query: everything addressed to all, plus anything naming this
  // merchant by any of its known spellings.
  const mongoQuery = mine.length
    ? {
        $or: [
          { targetAudience: 'all' },
          { targetAudience: 'specific', merchantId: { $in: mine } },
          { targetAudience: 'specific', merchantAliases: { $in: mine } },
        ],
      }
    : { targetAudience: 'all' };

  const [mongo, supa] = await Promise.all([
    queryMongoCollection<Record<string, any>>(COLLECTION, mongoQuery, {
      limit,
      sort: { createdAt: -1 },
    }),
    querySupabaseTable<Record<string, any>>(COLLECTION, {
      limit,
      // `created_at` is the column written by the Supabase mirror below; the
      // newest-first ordering is re-applied after the merge anyway.
      filters: { order: 'created_at.desc' },
    }),
  ]);

  const readKey = mine[0] || '';
  const byId = new Map<string, MerchantNotification>();
  for (const row of [...mongo.rows, ...supa.rows]) {
    const notification = normalizeNotification(row, readKey);
    if (!isAddressedToMerchant(notification, mine)) continue;
    if (!matchesAudienceFilter(notification, options.planId || '')) continue;
    const existing = byId.get(notification.id);
    // Prefer the copy that carries the read receipt we just wrote.
    if (!existing || (existing.isRead && !notification.isRead)) {
      byId.set(notification.id, notification);
    } else {
      byId.set(notification.id, { ...notification, isRead: existing.isRead || notification.isRead });
    }
  }

  const notifications = [...byId.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const sources: DataSource[] = [];
  if (mongo.rows.length) sources.push('mongodb');
  if (supa.rows.length) sources.push('supabase');

  return {
    ok: true,
    data: notifications,
    sources,
    error: mongo.error || supa.error,
  };
}

/* ────────────────────────── writes ────────────────────────── */

/**
 * Create one notification. Accepts either an audience-wide send
 * (`targetAudience: 'all'` + optional `audienceFilter`) or a targeted send
 * (`targetAudience: 'specific'` + `merchantId`/`merchantAliases`).
 */
export async function createNotification(
  raw: Record<string, any>
): Promise<NotificationResult<MerchantNotification>> {
  const title = String(raw?.title || raw?.subject || '').trim();
  if (!title) return { ok: false, data: null, sources: [], error: 'A notification title is required.' };

  const targetAudience: NotificationTargetAudience =
    String(raw?.targetAudience || raw?.target_audience || 'all').toLowerCase() === 'specific'
      ? 'specific'
      : 'all';

  const notification: MerchantNotification = {
    ...normalizeNotification(
      {
        id: safeId(raw?.id, 'ntf'),
        targetAudience,
        merchantId: raw?.merchantId || raw?.merchant_id || '',
        merchantAliases: raw?.merchantAliases || raw?.merchant_aliases,
        title,
        message: raw?.message || raw?.body || raw?.desc || '',
        type: raw?.type,
        createdAt: raw?.createdAt || new Date().toISOString(),
        isRead: Boolean(raw?.isRead),
        readBy: raw?.readBy,
        audienceFilter: raw?.audienceFilter || raw?.audience_filter,
        meta: raw?.meta,
      },
      undefined
    ),
    // A targeted send starts unread. An audience-wide send ALWAYS starts unread
    // at the document level — per-merchant state lives in `readBy`.
    isRead: targetAudience === 'specific' ? Boolean(raw?.isRead) : false,
  };

  const sources: DataSource[] = [];

  const mongo = await upsertMongoById(COLLECTION, notification);
  if (mongo.ok) {
    sources.push('mongodb');
    void ensureIndexes();
  } else {
    console.warn('[notificationStore] notifications Mongo write warning:', mongo.error);
  }

  const sb = await writeSupabaseRow({
    id: notification.id,
    target_audience: notification.targetAudience,
    merchant_id: notification.merchantId,
    merchant_aliases: notification.merchantAliases,
    title: notification.title,
    message: notification.message,
    type: notification.type,
    created_at: notification.createdAt,
    is_read: notification.isRead,
    read_by: notification.readBy,
    audience_filter: notification.audienceFilter,
    meta: notification.meta,
  });
  if (sb.ok) sources.push('supabase');
  else console.warn('[notificationStore] notifications Supabase write warning:', sb.error);

  return {
    ok: sources.length > 0,
    data: notification,
    sources,
    error: sources.length ? undefined : 'Failed to persist notification to any provider.',
  };
}

/**
 * Mark one notification read FOR THIS MERCHANT.
 *
 * A targeted notification flips its own `isRead`. An audience-wide broadcast
 * instead records this merchant in `readBy`, so other merchants keep their
 * unread badge. Never throws; returns `ok: false` for an unknown id.
 */
export async function markNotificationRead(
  id: string,
  aliases: string[]
): Promise<NotificationResult<{ id: string; isRead: true; targeted: boolean }>> {
  const notificationId = String(id || '').trim();
  if (!notificationId) {
    return { ok: false, data: null, sources: [], error: 'Notification id is required.' };
  }

  const mine = normalizeAliases(aliases);
  const readKey = mine[0] || '';
  if (!readKey) {
    return { ok: false, data: null, sources: [], error: 'A store reference is required to mark a notification read.' };
  }

  const { db, error } = await safeMongoDb();
  if (!db) return { ok: false, data: null, sources: [], error };

  const existing = await db.collection(COLLECTION).findOne({ id: notificationId });
  if (!existing) {
    return { ok: false, data: null, sources: [], error: `Notification ${notificationId} not found.` };
  }

  const stored = normalizeNotification(existing);
  // Refuse to acknowledge somebody else's targeted notification.
  if (!isAddressedToMerchant(stored, mine)) {
    return { ok: false, data: null, sources: [], error: 'Notification does not belong to this store.' };
  }

  const targeted = stored.targetAudience === 'specific';
  const now = new Date().toISOString();
  const sources: DataSource[] = [];

  if (targeted) {
    await db.collection(COLLECTION).updateOne(
      { id: notificationId },
      { $set: { isRead: true, is_read: true, read_at: now, updated_at: now, updatedAt: now } }
    );
    sources.push('mongodb');
  } else {
    // Only ever ADD this merchant's receipt. `$set` on the whole map would
    // clobber receipts written by every other store in the meantime.
    await db.collection(COLLECTION).updateOne(
      { id: notificationId },
      { $set: { [`readBy.${readKey}`]: true, updated_at: now, updatedAt: now } }
    );
    sources.push('mongodb');
  }

  // Mirror to Supabase when it is configured. Best-effort: the authoritative
  // read state lives in Mongo, and the GET merges on read.
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
    if (supabaseUrl && supabaseKey) {
      const url = `${supabaseUrl}/rest/v1/${COLLECTION}?id=eq.${encodeURIComponent(notificationId)}`;
      const body = targeted
        ? { is_read: true, read_at: now }
        : { read_by: { ...(existing.readBy || existing.read_by || {}), [readKey]: true } };
      const res = await fetch(url, {
        method: 'PATCH',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
      });
      if (res.ok) sources.push('supabase');
    }
  } catch (err: any) {
    console.warn('[notificationStore] Supabase read-receipt mirror warning:', err?.message || err);
  }

  return {
    ok: true,
    data: { id: notificationId, isRead: true as const, targeted },
    sources,
  };
}

export default {
  createNotification,
  readNotificationsForMerchant,
  markNotificationRead,
  normalizeNotification,
  matchesAudienceFilter,
  isAddressedToMerchant,
};