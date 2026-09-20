/**
 * Admin merchant-store data access for the Super Admin Portal (`/admin`).
 *
 * Reads and mutates merchant/store records in the single `zidbdsaas` MongoDB
 * database. The platform has historically stored these in either a `stores`
 * collection (newer) or a `merchants` collection (legacy); every read here
 * merges both so no account is missed, and every write targets whichever
 * collection actually holds the record (falling back to `stores`).
 *
 * Everything is best-effort and NEVER throws a 5xx: callers get a fully-shaped
 * envelope with `ok:false` + `error` when something went wrong. This mirrors
 * lib/adminAnalytics.ts so both admin endpoints behave identically.
 *
 * Import-safe from the local Express bootstrap (server.ts) and the Vercel
 * serverless functions (api/admin/merchants.ts).
 */

import { connectToDatabase, getMongoUri, describeMongoError, DB_NAME } from './db.js';
import type { MongoFailure } from './db.js';
import { getSupabaseServerConfig } from './hybridDb.js';

/** Normalised merchant row returned to the admin dashboard. */
export interface AdminMerchant {
  id: string;
  storeCode: string;
  storeName: string;
  storeSlug: string;
  ownerName: string;
  email: string;
  phone: string;
  subscriptionPlan: string;
  subscriptionExpiry: string | null;
  planStartedAt: string | null;
  expiresAt: string | null;
  durationDays: number;
  trialDaysRemaining: number;
  trialEndsAt: string | null;
  isLocked: boolean;
  /** Derived bucket used by the dashboard's filter tabs. */
  status: 'active' | 'trial' | 'suspended' | 'expired';
  totalSalesBDT: number;
  onboardingProgress: number;
  createdAt: string | null;
}

export interface AdminMerchantListResult {
  ok: boolean;
  generatedAt: string;
  database: string;
  merchants: AdminMerchant[];
  counts: {
    all: number;
    active: number;
    trial: number;
    suspended: number;
  };
  error?: string;
  /** Structured DB diagnosis (code + actionable message) when the read failed. */
  dbError?: MongoFailure | null;
}

const NON_PAID_PLANS = new Set(['free_trial', 'trial', 'free', 'basic', 'starter', '']);

export function isPaidPlanId(planId: string): boolean {
  const key = String(planId || '').toLowerCase().trim();
  if (NON_PAID_PLANS.has(key)) return false;
  if (key.includes('pro') || key.includes('enterprise') || key.includes('business') || key.includes('premium') || key.includes('growth')) return true;
  return /(?:^|_)(1m|3m|6m|12m)$/.test(key) || /(?:^|_)(1|3|6|12)$/.test(key);
}

/** Days granted by a plan id (mirrors getPlanDurationInDays on the server). */
export function planDurationDays(planId: string): number {
  const key = String(planId || '').toLowerCase().trim();
  if (key.includes('12m') || key.includes('enterprise') || key.includes('year')) return 365;
  if (key.includes('6m') || key.includes('pro') || key.includes('half_year')) return 180;
  if (key.includes('3m') || key.includes('starter')) return 90;
  return 30;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value.replace(/[^0-9.\-]/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function pick(record: Record<string, any> | null | undefined, keys: string[]): any {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function planIdOf(record: Record<string, any>): string {
  return String(
    pick(record, ['subscription_plan', 'subscriptionPlan', 'plan', 'planId', 'plan_id']) || 'free_trial'
  ).toLowerCase();
}

/**
 * Classify a store into the dashboard's filter buckets.
 *  - 'suspended' → explicitly locked / suspended status
 *  - 'trial'     → non-paid plan still within its trial window
 *  - 'expired'   → paid plan whose expiry has passed, or a trial that ran out
 *  - 'active'    → everything else (a currently-valid paid subscription)
 */
export function classifyMerchant(plan: string, isLocked: boolean, expiresAtRaw: unknown, trialEndsAtRaw: unknown): AdminMerchant['status'] {
  if (isLocked) return 'suspended';
  const now = Date.now();
  if (isPaidPlanId(plan)) {
    const exp = expiresAtRaw ? new Date(String(expiresAtRaw)).getTime() : NaN;
    if (!Number.isNaN(exp) && exp < now) return 'expired';
    return 'active';
  }
  // Non-paid: trial if it still has time left, otherwise expired.
  const trialEnd = trialEndsAtRaw ? new Date(String(trialEndsAtRaw)).getTime() : NaN;
  if (!Number.isNaN(trialEnd) && trialEnd < now) return 'expired';
  return 'trial';
}

/**
 * Build the unique identity key for a raw store/merchant document.
 *
 * WHY THIS IS SLUG-FIRST (and not `id`-first)
 * ---------------------------------------------------------------------------
 * The SAME store is written to several collections with DIFFERENT document ids —
 * `stores` uses `_id`, the upserted `merchants` mirror uses its own `_id`, and a
 * legacy row may carry only `store_code`. Keying on `id`/`_id` therefore produced
 * a SEPARATE key per document and the admin table rendered the same store two or
 * three times.
 *
 * `store_slug` (falling back to the permanent `store_code`) is the shared,
 * human-stable identifier, so it is checked FIRST. Mongo's `_id` is used only
 * as a last resort — it is a document id, never a business key.
 */
export function merchantUniqueKey(record: Record<string, any> | null | undefined): string {
  if (!record) return '';
  const slugish = pick(record, ['store_slug', 'storeSlug', 'slug']);
  if (slugish) return `slug:${String(slugish).trim().toLowerCase()}`;

  const code = pick(record, ['store_code', 'storeCode']);
  if (code) return `code:${String(code).trim().toUpperCase()}`;

  const idish = pick(record, ['id', 'store_id', 'storeId', 'merchant_id', 'merchantId']);
  if (idish) return `id:${String(idish).trim().toLowerCase()}`;

  const email = pick(record, ['email', 'owner_email', 'ownerEmail']);
  if (email) return `email:${String(email).trim().toLowerCase()}`;

  return '';
}

/** Map a raw MongoDB store/merchant document into the normalised AdminMerchant shape. */
export function normalizeMerchant(record: Record<string, any>): AdminMerchant {
  const plan = planIdOf(record);
  const isLocked = record?.isLocked === true
    || record?.is_locked === true
    || String(record?.status || '').toLowerCase() === 'suspended';

  const planStartedAt = toIso(pick(record, ['plan_started_at', 'planStartedAt', 'subscriptionStartDate']));
  let expiresAt = toIso(pick(record, ['expires_at', 'expiresAt', 'subscriptionEndDate', 'subscription_expiry', 'subscriptionExpiry']));
  let subscriptionExpiry = pick(record, ['subscription_expiry', 'subscriptionExpiry']) as string | null;

  const durationDays = toNumber(
    pick(record, ['duration_days', 'durationDays', 'selectedPlanDays']),
    planDurationDays(plan)
  );

  const trialEndsAt = toIso(pick(record, ['trialEndsAt', 'trial_ends_at']));
  let trialDaysRemaining = toNumber(pick(record, ['trialDaysRemaining', 'trial_days_remaining']), 0);
  if (!trialDaysRemaining && trialEndsAt) {
    trialDaysRemaining = Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000));
  }

  const status = classifyMerchant(plan, isLocked, expiresAt, trialEndsAt);
  // Surface a sensible expiry even when only snake_case columns exist.
  if (!subscriptionExpiry && expiresAt) subscriptionExpiry = expiresAt.split('T')[0];

  return {
    id: String(pick(record, ['id', '_id', 'store_id', 'storeId']) || ''),
    storeCode: String(pick(record, ['store_code', 'storeCode']) || ''),
    storeName: String(pick(record, ['store_name', 'storeName', 'name']) || 'Untitled Store'),
    storeSlug: String(pick(record, ['store_slug', 'storeSlug', 'slug']) || ''),
    ownerName: String(pick(record, ['owner_name', 'ownerName', 'owner']) || ''),
    email: String(pick(record, ['email', 'owner_email', 'ownerEmail']) || ''),
    phone: String(pick(record, ['phone', 'owner_phone', 'ownerPhone', 'mobile']) || ''),
    subscriptionPlan: plan,
    subscriptionExpiry: subscriptionExpiry || null,
    planStartedAt,
    expiresAt,
    durationDays,
    trialDaysRemaining,
    trialEndsAt,
    isLocked,
    status,
    totalSalesBDT: toNumber(pick(record, ['totalSalesBDT', 'total_sales_bdt']), 0),
    onboardingProgress: toNumber(pick(record, ['onboardingProgress', 'onboarding_progress']), 0),
    createdAt: toIso(pick(record, ['created_at', 'createdAt', 'registered_at'])),
  };
}

/**
 * Resolve the native Db handle. Always returns a structured outcome so the
 * caller can report WHY Mongo was unavailable (missing URI vs. bad credentials
 * vs. timeout) instead of the generic "not configured or unavailable".
 */
async function getDb(dbName: string = DB_NAME): Promise<{ db: any | null; failure: MongoFailure | null }> {
  if (!getMongoUri()) {
    return { db: null, failure: describeMongoError(new Error('MONGODB_URI is not set')) };
  }
  try {
    const mongoose = await connectToDatabase(dbName);
    const db = mongoose.connection.db ?? null;
    return { db, failure: db ? null : describeMongoError(new Error('connection handle unavailable')) };
  } catch (err) {
    const failure = describeMongoError(err);
    console.warn('[adminMerchants] Mongo connection failure:', failure.detail || failure.message);
    return { db: null, failure };
  }
}

/* ────────────────────────── Supabase redundancy (mirror of `stores`) ────────────────────────── */

/**
 * Physical snake_case columns on the Supabase `stores` table that the admin
 * write paths are allowed to mirror. Anything outside this list is dropped so
 * PostgREST never rejects a write for an unknown column.
 */
const SUPABASE_STORE_WRITE_COLUMNS = [
  'id',
  'store_code',
  'store_slug',
  'store_name',
  'owner_name',
  'email',
  'phone',
  'password',
  'logo_url',
  'subscription_plan',
  'subscription_expiry',
  'plan_started_at',
  'expires_at',
  'duration_days',
  'trial_ends_at',
  'trial_days_remaining',
  'is_locked',
  'status',
  'created_at',
  'updated_at',
] as const;

/** Copy the known `stores` columns present in `source` into a new object. */
function pickStoreColumns(
  source: Record<string, any>,
  columns: readonly string[]
): Record<string, any> {
  const out: Record<string, any> = {};
  for (const column of columns) {
    const value = source[column];
    if (value !== undefined) out[column] = value;
  }
  return out;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** true when `value` is a canonical UUID (the type of Supabase `stores.id`). */
function isUuid(value: unknown): boolean {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

/**
 * Mirror a merchant/store record into the Supabase `stores` table.
 *
 * The Super Admin portal writes merchants straight to MongoDB; this helper
 * adds the SAME write to Supabase so the two providers stay in sync. That is
 * what keeps the "automatic Mongo/Fallback redundancy" contract true for the
 * admin portal too: if MongoDB is later degraded, the record is still readable
 * from Supabase (and vice-versa — the auth path reads Supabase first).
 *
 * Upserts by `store_slug` via the REST API. NEVER throws: a Supabase outage
 * must not fail an admin write that already succeeded in Mongo. Returns the
 * outcome so the caller can report which providers accepted the write.
 */
async function mirrorMerchantToSupabase(
  record: Record<string, any>,
  matchColumn: string = 'store_slug'
): Promise<{ ok: boolean; error?: string }> {
  const { supabaseUrl, supabaseKey, isConfigured } = getSupabaseServerConfig();
  if (!isConfigured) return { ok: false, error: 'Supabase is not configured.' };

  const matchValue = String(record[matchColumn] || record.store_slug || record.storeSlug || record.email || '').trim();
  if (!matchValue) return { ok: false, error: 'No store identity to mirror.' };

  // Keep ONLY the physical snake_case columns of the Supabase `stores` table.
  // Mongo documents carry camelCase aliases (`storeName`, `storeSlug`, …) and
  // helper keys (`_id`); PostgREST rejects an unknown column and would fail the
  // whole mirror write, so those are dropped here.
  const payload = pickStoreColumns(record, SUPABASE_STORE_WRITE_COLUMNS);
  // `stores.id` is a uuid column; the admin-created `store-<ts>` string id would
  // be rejected, so let Supabase generate its own UUID when the id is not one.
  if (payload.id && !isUuid(payload.id)) delete payload.id;
  if (Object.keys(payload).length === 0) return { ok: false, error: 'No mappable store columns to mirror.' };

  const headers: Record<string, string> = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Prefer: 'resolution=merge-duplicates',
  };

  try {
    // Upsert with `on_conflict` so a repeat write updates the existing row
    // instead of violating a unique constraint on store_slug.
    const url = `${supabaseUrl}/rest/v1/stores?on_conflict=${encodeURIComponent(matchColumn)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
    });

    if (res.ok) return { ok: true };
    return { ok: false, error: `Supabase stores upsert responded ${res.status}` };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Supabase stores upsert failed' };
  }
}

/**
 * Mirror a PATCH payload onto the Supabase `stores` row identified by `ref`.
 * Applied by store_slug first, then by id, since either may be the stored key.
 * NEVER throws.
 */
async function patchMerchantInSupabase(
  ref: string,
  patch: Record<string, any>
): Promise<{ ok: boolean; error?: string }> {
  const { supabaseUrl, supabaseKey, isConfigured } = getSupabaseServerConfig();
  if (!isConfigured) return { ok: false, error: 'Supabase is not configured.' };

  const payload = pickStoreColumns(patch, SUPABASE_STORE_WRITE_COLUMNS);
  if (Object.keys(payload).length === 0) return { ok: false, error: 'No mappable store columns to patch.' };

  const cleaned = String(ref || '').trim();
  const slug = cleaned.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  const headers: Record<string, string> = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Prefer: 'return=minimal',
  };

  const attempts: Array<{ column: string; value: string }> = [
    { column: 'store_slug', value: slug || cleaned },
    { column: 'id', value: cleaned },
  ];

  let lastError: string | undefined;
  for (const attempt of attempts) {
    if (!attempt.value) continue;
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/stores?${attempt.column}=eq.${encodeURIComponent(attempt.value)}`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
        }
      );
      if (res.ok) return { ok: true };
      lastError = `Supabase stores PATCH responded ${res.status}`;
    } catch (err: any) {
      lastError = err?.message || 'Supabase stores PATCH failed';
    }
  }

  return { ok: false, error: lastError || 'Supabase stores PATCH failed' };
}

/**
 * Delete the Supabase `stores` row(s) matching `ref` by slug and id. NEVER
 * throws — a Supabase outage leaves the Mongo delete (already applied) intact.
 */
async function deleteMerchantInSupabase(ref: string): Promise<{ ok: boolean; error?: string }> {
  const { supabaseUrl, supabaseKey, isConfigured } = getSupabaseServerConfig();
  if (!isConfigured) return { ok: false, error: 'Supabase is not configured.' };

  const cleaned = String(ref || '').trim();
  const slug = cleaned.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const headers: Record<string, string> = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    Accept: 'application/json',
  };

  let ok = false;
  let lastError: string | undefined;
  for (const [column, value] of [['store_slug', slug || cleaned], ['id', cleaned]] as const) {
    if (!value) continue;
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/stores?${column}=eq.${encodeURIComponent(value)}`,
        { method: 'DELETE', headers, signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined }
      );
      if (res.ok) ok = true;
      else lastError = `Supabase stores DELETE responded ${res.status}`;
    } catch (err: any) {
      lastError = err?.message || 'Supabase stores DELETE failed';
    }
  }
  return { ok, error: ok ? undefined : lastError };
}

/**
 * List every merchant/store account across the `stores` and `merchants`
 * collections, de-duplicated by slug/store_id and optionally filtered.
 *
 * @param opts.status  one of all|active|trial|suspended (suspended also covers expired)
 * @param opts.search  case-insensitive match on store name, owner, email, slug, phone
 */
export async function listAdminMerchants(opts: { status?: string; search?: string } = {}): Promise<AdminMerchantListResult> {
  const base: AdminMerchantListResult = {
    ok: true,
    generatedAt: new Date().toISOString(),
    database: DB_NAME,
    merchants: [],
    counts: { all: 0, active: 0, trial: 0, suspended: 0 },
  };

  const { db, failure } = await getDb();
  if (!db) return { ...base, ok: false, error: failure?.message || 'MongoDB is not configured or unavailable.', dbError: failure };

  const raw: Record<string, any>[] = [];

  for (const collectionName of ['stores', 'merchants']) {
    try {
      const rows = await db.collection(collectionName).find({}).limit(5000).toArray();
      for (const row of rows) raw.push(row);
    } catch (err: any) {
      // Missing collection is expected (legacy vs new deployments).
      if (!/ns not found|does not exist/i.test(String(err?.message || ''))) {
        console.warn(`[adminMerchants] ${collectionName} lookup warning:`, err?.message || err);
      }
    }
  }

  // ── De-duplication ──────────────────────────
  // Collapse every document describing the SAME store into a single row, keyed
  // by store_slug / store_code first (see merchantUniqueKey). A Map retains the
  // first occurrence per key, matching the documented
  // `Array.from(new Map(rows.map(r => [key, r])).values())` behaviour, but it
  // additionally MERGES fields across the duplicates so a store whose name lives
  // in `stores` and whose plan lives in `merchants` still renders completely.
  const byKey = new Map<string, Record<string, any>>();
  const unkeyed: Record<string, any>[] = [];

  for (const row of raw) {
    const key = merchantUniqueKey(row);
    if (!key) {
      // A row with no usable identity cannot be de-duped safely — keep it so a
      // half-written record is still visible rather than silently dropped.
      unkeyed.push(row);
      continue;
    }
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...row });
      continue;
    }
    // Same store from another collection: backfill only the fields the first
    // copy is missing, so the primary (`stores`) values always win.
    for (const [field, value] of Object.entries(row)) {
      const current = existing[field];
      if ((current === undefined || current === null || current === '') && value !== undefined && value !== null && value !== '') {
        existing[field] = value;
      }
    }
  }

  let merchants = [...byKey.values(), ...unkeyed].map(normalizeMerchant);

  // Defensive second pass on the NORMALISED records: two raw rows can carry
  // different spellings of the same slug (`storeSlug` vs `store_slug`) and only
  // collapse once normalised. Cheap, and it guarantees the UI never sees a
  // duplicate even if a write path invents a new field name.
  const finalByKey = new Map<string, AdminMerchant>();
  for (const merchant of merchants) {
    const key = merchantUniqueKey(merchant) || `id:${merchant.id}` || `email:${merchant.email}`;
    if (!finalByKey.has(key)) finalByKey.set(key, merchant);
  }
  merchants = [...finalByKey.values()];

  // Counts reflect the FULL set (before status/search filtering) so the tabs
  // can show real totals regardless of the active filter.
  const counts = {
    all: merchants.length,
    active: merchants.filter((m) => m.status === 'active').length,
    trial: merchants.filter((m) => m.status === 'trial').length,
    suspended: merchants.filter((m) => m.status === 'suspended' || m.status === 'expired').length,
  };

  const status = String(opts.status || 'all').toLowerCase();
  if (status && status !== 'all') {
    if (status === 'suspended') {
      merchants = merchants.filter((m) => m.status === 'suspended' || m.status === 'expired');
    } else {
      merchants = merchants.filter((m) => m.status === status);
    }
  }

  const search = String(opts.search || '').trim().toLowerCase();
  if (search) {
    merchants = merchants.filter((m) =>
      m.storeName.toLowerCase().includes(search) ||
      m.ownerName.toLowerCase().includes(search) ||
      m.email.toLowerCase().includes(search) ||
      m.storeSlug.toLowerCase().includes(search) ||
      m.storeCode.toLowerCase().includes(search) ||
      m.phone.toLowerCase().includes(search)
    );
  }

  // Stable ordering: most recently-registered stores first.
  merchants.sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });

  return { ...base, merchants, counts };
}

/** Build a Mongo filter that matches a store by ANY of its identity fields. */
function merchantIdentityFilter(ref: string): any {
  const raw = String(ref || '').trim();
  const slug = raw.toLowerCase();
  const candidates = Array.from(new Set([raw, slug].filter(Boolean)));
  return {
    $or: [
      { id: { $in: candidates } },
      { store_id: { $in: candidates } },
      { storeId: { $in: candidates } },
      { store_slug: { $in: candidates } },
      { storeSlug: { $in: candidates } },
      { store_code: { $in: candidates } },
      { storeCode: { $in: candidates } },
      { _id: { $in: candidates } },
    ],
  };
}

export interface MerchantActionResult {
  ok: boolean;
  merchant?: AdminMerchant;
  deleted?: boolean;
  /** true when an existing store was updated rather than a new one inserted. */
  updated?: boolean;
  error?: string;
  /** Structured DB diagnosis (code + actionable message) when the write failed. */
  dbError?: MongoFailure | null;
}

export interface DuplicateCleanupResult {
  ok: boolean;
  generatedAt: string;
  database: string;
  /** Duplicate documents permanently removed. */
  removed: number;
  /** Store slugs that had more than one document. */
  duplicateGroups: number;
  /** Per-slug detail, so an operator can see exactly what was collapsed. */
  groups: { key: string; kept: string; removedIds: string[] }[];
  dryRun: boolean;
  error?: string;
  dbError?: MongoFailure | null;
}

/**
 * Apply an action to a single merchant record.
 *
 * action 'extend_trial' → push trialEndsAt/trialDaysRemaining forward by `days`
 * action 'change_plan'  → switch the subscription plan and recompute expiry
 * action 'suspend'      → lock the account (isLocked: true)
 * action 'unsuspend'    → unlock the account (isLocked: false)
 * action 'delete'       → remove the record entirely
 */
export async function applyMerchantAction(
  ref: string,
  action: string,
  payload: Record<string, any> = {}
): Promise<MerchantActionResult> {
  const { db, failure } = await getDb();
  if (!db) return { ok: false, error: failure?.message || 'MongoDB is not configured or unavailable.', dbError: failure };

  const filter = merchantIdentityFilter(ref);

  if (action === 'delete') {
    let deleted = 0;
    for (const collectionName of ['stores', 'merchants']) {
      try {
        const res = await db.collection(collectionName).deleteOne(filter);
        deleted += res?.deletedCount || 0;
      } catch (err: any) {
        console.warn(`[adminMerchants] delete ${collectionName} warning:`, err?.message || err);
      }
    }
    // Mirror the delete to Supabase so the fallback store does not keep serving
    // a merchant the admin just removed. Best-effort (never blocks the result).
    const sbDelete = await deleteMerchantInSupabase(ref);
    if (!sbDelete.ok) console.warn('[adminMerchants] Supabase delete mirror warning:', sbDelete.error);
    return { ok: deleted > 0, deleted: deleted > 0, error: deleted > 0 ? undefined : 'Merchant not found.' };
  }

  const now = Date.now();
  const set: Record<string, any> = { updated_at: new Date().toISOString() };

  if (action === 'extend_trial') {
    const days = Math.max(1, toNumber(payload.days, 7));
    // Extend from the later of (now, current trialEndsAt) so extensions stack.
    let baseMs = now;
    try {
      const current = await findMerchantRecord(db, ref);
      const existing = pick(current, ['trialEndsAt', 'trial_ends_at', 'expires_at', 'subscription_expiry']);
      const existingMs = existing ? new Date(String(existing)).getTime() : NaN;
      if (!Number.isNaN(existingMs) && existingMs > baseMs) baseMs = existingMs;
    } catch { /* fall back to now */ }
    const newEndsAt = new Date(baseMs + days * 86400000).toISOString();
    set.trialEndsAt = newEndsAt;
    set.trial_ends_at = newEndsAt;
    set.expires_at = newEndsAt;
    set.subscription_expiry = newEndsAt.split('T')[0];
    set.trialDaysRemaining = -1; // sentinel: normalizeMerchant recomputes from trialEndsAt
  } else if (action === 'change_plan') {
    const plan = String(payload.plan || 'free_trial').toLowerCase();
    const isTrial = plan === 'free_trial' || plan === 'trial';
    const durationDays = planDurationDays(plan);
    const expiresAt = isTrial
      ? null
      : new Date(now + durationDays * 86400000).toISOString();
    set.subscription_plan = plan;
    set.subscriptionPlan = plan;
    set.duration_days = durationDays;
    set.durationDays = durationDays;
    set.plan_started_at = new Date(now).toISOString();
    set.planStartedAt = set.plan_started_at;
    if (isTrial) {
      const trialEnd = new Date(now + durationDays * 86400000).toISOString();
      set.expires_at = trialEnd;
      set.trialEndsAt = trialEnd;
      set.trial_ends_at = trialEnd;
      set.subscription_expiry = null;
    } else {
      set.expires_at = expiresAt;
      set.expiresAt = expiresAt;
      set.subscription_expiry = expiresAt ? expiresAt.split('T')[0] : null;
      set.trialEndsAt = null;
      set.trial_ends_at = null;
      set.trialDaysRemaining = 0;
    }
  } else if (action === 'suspend' || action === 'unsuspend') {
    set.isLocked = action === 'suspend';
    set.is_locked = action === 'suspend';
    set.status = action === 'suspend' ? 'suspended' : 'active';
  } else {
    return { ok: false, error: `Unknown action: ${action}` };
  }

  // Update ALL identity matches in both collections so the record is consistent
  // regardless of which store alias the caller used.
  let matched = 0;
  for (const collectionName of ['stores', 'merchants']) {
    try {
      const res = await db.collection(collectionName).updateMany(filter, { $set: set });
      matched += res?.matchedCount || 0;
    } catch (err: any) {
      console.warn(`[adminMerchants] ${action} ${collectionName} warning:`, err?.message || err);
    }
  }

  if (matched === 0) {
    return { ok: false, error: 'Merchant not found.' };
  }

  // Mirror the SAME patch to Supabase (redundancy). Best-effort: a Supabase
  // outage must not fail an admin action that already applied in MongoDB.
  const sbPatch = await patchMerchantInSupabase(ref, set);
  if (!sbPatch.ok) console.warn('[adminMerchants] Supabase update mirror warning:', sbPatch.error);

  const updated = await findMerchantRecord(db, ref);
  return { ok: true, merchant: updated ? normalizeMerchant(updated) : undefined };
}

/** Find a single merchant document (across both collections). */
async function findMerchantRecord(db: any, ref: string): Promise<Record<string, any> | null> {
  const filter = merchantIdentityFilter(ref);
  for (const collectionName of ['stores', 'merchants']) {
    try {
      const doc = await db.collection(collectionName).findOne(filter);
      if (doc) return doc;
    } catch { /* try next collection */ }
  }
  return null;
}

export interface CreateMerchantInput {
  storeName: string;
  email?: string;
  ownerName?: string;
  phone?: string;
  plan?: string;
  password?: string;
}

/**
 * Create OR update a merchant/store record, keyed by store_slug.
 *
 * IDEMPOTENT BY DESIGN
 * ---------------------------------------------------------------------------
 * This used to `insertOne()` unconditionally with a freshly generated
 * `store_code` and `id`. Onboarding the same store twice therefore produced TWO
 * documents sharing a `store_slug` but differing in every other key, which is
 * what rendered as duplicate rows in the Merchant Accounts table.
 *
 * Now the store is looked up by slug (and by email) across `stores` and
 * `merchants` first. If it exists the existing document is UPDATED in place and
 * its permanent `store_code`/`id` are PRESERVED — a store's system ID must never
 * change, since orders and products reference it.
 *
 * `mode: 'upsert' | 'insert'` allows a caller that genuinely wants a second
 * store with the same display name to force an insert; the default is upsert.
 */
export async function createAdminMerchant(
  input: CreateMerchantInput & { mode?: 'upsert' | 'insert' }
): Promise<MerchantActionResult> {
  const { db, failure } = await getDb();
  if (!db) return { ok: false, error: failure?.message || 'MongoDB is not configured or unavailable.', dbError: failure };

  const storeName = String(input.storeName || '').trim();
  if (!storeName) return { ok: false, error: 'Store name is required.' };

  const plan = String(input.plan || 'free_trial').toLowerCase();
  const isTrial = plan === 'free_trial' || plan === 'trial';
  const durationDays = planDurationDays(plan);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const slug = storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'new-store';
  const email = String(input.email || '').trim().toLowerCase();
  const expiresAt = new Date(now + durationDays * 86400000).toISOString();

  // ── 1. Does this store already exist? ──────────────
  // Matched on slug OR email, case-insensitively, across both collections, so a
  // store created through a different write path is still recognised.
  const wantsInsert = input.mode === 'insert';
  let existing: Record<string, any> | null = null;

  if (!wantsInsert) {
    const orClauses: Record<string, any>[] = [
      { store_slug: slug },
      { storeSlug: slug },
      { slug },
    ];
    if (email) {
      orClauses.push({ email }, { owner_email: email }, { ownerEmail: email });
    }
    for (const collectionName of ['stores', 'merchants']) {
      try {
        const found = await db.collection(collectionName).findOne({ $or: orClauses });
        if (found) {
          existing = found as Record<string, any>;
          break;
        }
      } catch (err: any) {
        if (!/ns not found|does not exist/i.test(String(err?.message || ''))) {
          console.warn(`[adminMerchants] ${collectionName} existence check warning:`, err?.message || err);
        }
      }
    }
  }

  // ── 2. Update in place when it exists (preserve the permanent identity) ──
  if (existing) {
    const patch: Record<string, any> = {
      // Keep the ORIGINAL store_code and id — they are permanent identifiers
      // referenced by orders/products, so re-onboarding must not rewrite them.
      store_name: storeName,
      storeName,
      store_slug: slug,
      storeSlug: slug,
      owner_name: String(input.ownerName || '').trim() || existing.owner_name || existing.ownerName || '',
      ownerName: String(input.ownerName || '').trim() || existing.ownerName || existing.owner_name || '',
      email: email || existing.email || '',
      phone: String(input.phone || '').trim() || existing.phone || '',
      subscription_plan: plan,
      subscriptionPlan: plan,
      duration_days: durationDays,
      durationDays,
      plan_started_at: nowIso,
      planStartedAt: nowIso,
      expires_at: expiresAt,
      expiresAt,
      subscription_expiry: expiresAt.split('T')[0],
      trialEndsAt: isTrial ? expiresAt : null,
      trial_ends_at: isTrial ? expiresAt : null,
      trialDaysRemaining: isTrial ? durationDays : 0,
      updated_at: nowIso,
      updatedAt: nowIso,
    };

    try {
      await db.collection('stores').updateOne({ _id: existing._id }, { $set: patch });
      // Remove any duplicate rows for the same slug left over from the previous
      // non-idempotent insert path, so the cleanup and the write agree.
      try {
        await db.collection('stores').deleteMany({
          _id: { $ne: existing._id },
          $or: [{ store_slug: slug }, { storeSlug: slug }],
        });
      } catch { /* best-effort tidy-up */ }

      // Mirror the update to Supabase (redundancy in the other direction).
      const sbUpdate = await mirrorMerchantToSupabase({ ...existing, ...patch, store_slug: slug });
      if (!sbUpdate.ok) console.warn('[adminMerchants] Supabase upsert mirror warning:', sbUpdate.error);

      return { ok: true, merchant: normalizeMerchant({ ...existing, ...patch }), updated: true };
    } catch (err: any) {
      console.warn('[adminMerchants] update warning:', err?.message || err);
      return { ok: false, error: err?.message || 'Could not update the existing store.' };
    }
  }

  // ── 3. Genuinely new store → insert once ─────────────
  const storeCode = `ZID-BD-${String(Math.floor(1000 + Math.random() * 9000))}`;
  const id = `store-${now}-${Math.floor(Math.random() * 1000)}`;

  const record: Record<string, any> = {
    id,
    store_id: id,
    storeId: id,
    store_code: storeCode,
    storeCode,
    store_name: storeName,
    storeName,
    store_slug: slug,
    storeSlug: slug,
    owner_name: String(input.ownerName || '').trim(),
    ownerName: String(input.ownerName || '').trim(),
    email: String(input.email || '').trim().toLowerCase(),
    phone: String(input.phone || '').trim(),
    subscription_plan: plan,
    subscriptionPlan: plan,
    duration_days: durationDays,
    durationDays,
    plan_started_at: nowIso,
    planStartedAt: nowIso,
    expires_at: expiresAt,
    expiresAt,
    subscription_expiry: isTrial ? expiresAt.split('T')[0] : expiresAt.split('T')[0],
    trialEndsAt: isTrial ? expiresAt : null,
    trial_ends_at: isTrial ? expiresAt : null,
    trialDaysRemaining: isTrial ? durationDays : 0,
    isLocked: false,
    is_locked: false,
    status: 'active',
    totalSalesBDT: 0,
    onboardingProgress: 0,
    created_at: nowIso,
    createdAt: nowIso,
  };

  try {
    // A unique index on store_slug makes the intent explicit and stops a
    // concurrent double-submit from racing an insert past the existence check.
    // Created best-effort: an existing duplicate data set would otherwise make
    // index creation fail, and that must not block onboarding.
    try {
      await db.collection('stores').createIndex({ store_slug: 1 }, { unique: true, name: 'uniq_store_slug' });
    } catch (indexErr: any) {
      console.warn('[adminMerchants] unique store_slug index not created:', indexErr?.message || indexErr);
    }

    await db.collection('stores').insertOne(record);

    // Mirror the new merchant to Supabase so the auth path (which reads Supabase
    // FIRST) and the fallback store both see the freshly onboarded store.
    const sbCreate = await mirrorMerchantToSupabase(record);
    if (!sbCreate.ok) console.warn('[adminMerchants] Supabase insert mirror warning:', sbCreate.error);

    return { ok: true, merchant: normalizeMerchant(record), updated: false };
  } catch (err: any) {
    // A duplicate-key error means another request created this slug first —
    // return the existing row instead of failing the onboarding.
    if (/E11000|duplicate key/i.test(String(err?.message || ''))) {
      try {
        const existingRow = await db.collection('stores').findOne({ $or: [{ store_slug: slug }, { storeSlug: slug }] });
        if (existingRow) return { ok: true, merchant: normalizeMerchant(existingRow), updated: true };
      } catch { /* fall through to the error below */ }
    }
    console.warn('[adminMerchants] create warning:', err?.message || err);
    return { ok: false, error: err?.message || 'Could not create the store.' };
  }
}

/**
 * Remove duplicate store documents, keeping ONE row per store slug.
 *
 * WHY: createAdminMerchant() used to insert unconditionally, so re-onboarding a
 * store left several documents sharing a `store_slug`. Those all rendered as
 * separate rows in the Merchant Accounts table.
 *
 * SAFETY:
 *  - Groups by the SAME identity key the list endpoint de-dupes on
 *    (store_slug → store_code → id → email), so the cleanup and the read agree.
 *  - Within a group the row with the MOST fields wins; ties break on the oldest
 *    `created_at`, so the original record and its permanent store_code survive.
 *  - Every other document in the group is removed from BOTH `stores` and
 *    `merchants`.
 *  - `dryRun: true` reports what WOULD be removed without deleting anything.
 */
export async function cleanupDuplicateMerchants(opts: { dryRun?: boolean } = {}): Promise<DuplicateCleanupResult> {
  const dryRun = Boolean(opts.dryRun);
  const base: DuplicateCleanupResult = {
    ok: true,
    generatedAt: new Date().toISOString(),
    database: DB_NAME,
    removed: 0,
    duplicateGroups: 0,
    groups: [],
    dryRun,
  };

  const { db, failure } = await getDb();
  if (!db) return { ...base, ok: false, error: failure?.message || 'MongoDB is not configured or unavailable.', dbError: failure };

  // Collect every document from both collections, tagged with its source so the
  // right collection is targeted when deleting.
  const docs: { collection: string; doc: Record<string, any> }[] = [];
  for (const collectionName of ['stores', 'merchants']) {
    try {
      const rows = await db.collection(collectionName).find({}).limit(5000).toArray();
      for (const doc of rows) docs.push({ collection: collectionName, doc });
    } catch (err: any) {
      if (!/ns not found|does not exist/i.test(String(err?.message || ''))) {
        console.warn(`[adminMerchants] cleanup ${collectionName} warning:`, err?.message || err);
      }
    }
  }

  // Group by shared identity.
  const grouped = new Map<string, { collection: string; doc: Record<string, any> }[]>();
  for (const entry of docs) {
    const key = merchantUniqueKey(entry.doc);
    if (!key) continue;
    const list = grouped.get(key) || [];
    list.push(entry);
    grouped.set(key, list);
  }

  const groups: { key: string; kept: string; removedIds: string[] }[] = [];
  let removed = 0;

  for (const [key, entries] of grouped) {
    if (entries.length < 2) continue;

    // Keep the most complete record; ties → oldest created_at (the original).
    const scored = [...entries].sort((a, b) => {
      const fieldsA = Object.values(a.doc).filter((v) => v !== undefined && v !== null && v !== '').length;
      const fieldsB = Object.values(b.doc).filter((v) => v !== undefined && v !== null && v !== '').length;
      if (fieldsB !== fieldsA) return fieldsB - fieldsA;
      const ta = a.doc.created_at || a.doc.createdAt ? new Date(a.doc.created_at || a.doc.createdAt).getTime() : Infinity;
      const tb = b.doc.created_at || b.doc.createdAt ? new Date(b.doc.created_at || b.doc.createdAt).getTime() : Infinity;
      return ta - tb;
    });

    const keeper = scored[0];
    const duplicates = scored.slice(1).filter((entry) => String(entry.doc._id) !== String(keeper.doc._id));
    groups.push({
      key,
      kept: String(keeper.doc._id),
      removedIds: duplicates.map((d) => String(d.doc._id)),
    });

    if (dryRun) {
      removed += duplicates.length;
      continue;
    }

    // Backfill the keeper with anything only the duplicates carried, so removing
    // them cannot lose a field (e.g. a phone number written by a later onboarding).
    const backfill: Record<string, any> = {};
    for (const entry of duplicates) {
      for (const [field, value] of Object.entries(entry.doc)) {
        const current = keeper.doc[field];
        if ((current === undefined || current === null || current === '') && value !== undefined && value !== null && value !== '') {
          backfill[field] = value;
          keeper.doc[field] = value;
        }
      }
    }
    if (Object.keys(backfill).length > 0) {
      try {
        await db.collection(keeper.collection).updateOne({ _id: keeper.doc._id }, { $set: backfill });
      } catch (err: any) {
        console.warn('[adminMerchants] cleanup backfill warning:', err?.message || err);
      }
    }

    for (const collectionName of ['stores', 'merchants']) {
      const ids = duplicates.filter((d) => d.collection === collectionName).map((d) => d.doc._id).filter((id) => id !== undefined);
      if (ids.length === 0) continue;
      try {
        const res = await db.collection(collectionName).deleteMany({ _id: { $in: ids }});
        removed += res?.deletedCount || 0;
      } catch (err: any) {
        console.warn(`[adminMerchants] cleanup delete ${collectionName} warning:`, err?.message || err);
      }
    }
  }

  return { ...base, removed, duplicateGroups: groups.length, groups };
}

export default listAdminMerchants;
