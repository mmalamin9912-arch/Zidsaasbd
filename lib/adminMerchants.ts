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

import { connectToDatabase, getMongoUri, DB_NAME } from './db.js';

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

/** Resolve the native Db handle (or null when Mongo is unavailable). */
async function getDb(dbName: string = DB_NAME): Promise<any | null> {
  if (!getMongoUri()) return null;
  try {
    const mongoose = await connectToDatabase(dbName);
    return mongoose.connection.db ?? null;
  } catch (err) {
    console.warn('[adminMerchants] Mongo connection warning:', (err as any)?.message || err);
    return null;
  }
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

  const db = await getDb();
  if (!db) return { ...base, ok: false, error: 'MongoDB is not configured or unavailable.' };

  const raw: Record<string, any>[] = [];
  const seen = new Set<string>();

  for (const collectionName of ['stores', 'merchants']) {
    try {
      const rows = await db.collection(collectionName).find({}).limit(5000).toArray();
      for (const row of rows) {
        // De-dupe: prefer the first collection (stores) entry per identity key.
        const key = String(row?.id || row?.store_id || row?.store_slug || row?.storeSlug || row?.store_code || row?._id || '');
        if (!key || seen.has(key)) continue;
        seen.add(key);
        raw.push(row);
      }
    } catch (err: any) {
      // Missing collection is expected (legacy vs new deployments).
      if (!/ns not found|does not exist/i.test(String(err?.message || ''))) {
        console.warn(`[adminMerchants] ${collectionName} lookup warning:`, err?.message || err);
      }
    }
  }

  let merchants = raw.map(normalizeMerchant);

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
  error?: string;
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
  const db = await getDb();
  if (!db) return { ok: false, error: 'MongoDB is not configured or unavailable.' };

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
 * Create a new merchant/store record. Returns the normalised row on success.
 * A store_code (ZID-BD-XXXX) and slug are derived when not supplied.
 */
export async function createAdminMerchant(input: CreateMerchantInput): Promise<MerchantActionResult> {
  const db = await getDb();
  if (!db) return { ok: false, error: 'MongoDB is not configured or unavailable.' };

  const storeName = String(input.storeName || '').trim();
  if (!storeName) return { ok: false, error: 'Store name is required.' };

  const plan = String(input.plan || 'free_trial').toLowerCase();
  const isTrial = plan === 'free_trial' || plan === 'trial';
  const durationDays = planDurationDays(plan);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const slug = storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'new-store';
  const storeCode = `ZID-BD-${String(Math.floor(1000 + Math.random() * 9000))}`;
  const id = `store-${now}-${Math.floor(Math.random() * 1000)}`;
  const expiresAt = new Date(now + durationDays * 86400000).toISOString();

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
    await db.collection('stores').insertOne(record);
    return { ok: true, merchant: normalizeMerchant(record) };
  } catch (err: any) {
    console.warn('[adminMerchants] create warning:', err?.message || err);
    return { ok: false, error: err?.message || 'Could not create the store.' };
  }
}

export default listAdminMerchants;
