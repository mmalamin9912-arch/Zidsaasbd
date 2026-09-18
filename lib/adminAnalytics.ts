/**
 * Platform-wide aggregation for the Super Admin Portal (`/admin`).
 *
 * Runs against the single `zidbdsaas` MongoDB database and aggregates across
 * ALL stores and collections — there is no per-store filter here, unlike the
 * merchant-facing routes in server.ts / api/server.ts.
 *
 * Design notes
 * ------------
 *  - Everything is best-effort and NEVER throws: a missing collection or an
 *    unavailable database degrades to empty/zero totals so the admin dashboard
 *    renders instead of blanking out. Callers get a fully-shaped payload with
 *    `ok: false` + `error` attached when something went wrong.
 *  - Numeric totals are coerced with Number() because orders are inserted from
 *    several call sites (checkout, dashboard sync) and legacy documents may
 *    hold string amounts.
 *  - "Completed" orders are matched case-insensitively across the status values
 *    actually written by the order pipeline (New/Processing/Shipped/Delivered/
 *    Completed). Anything cancelled/returned/refunded is excluded from revenue.
 *  - Paid plans are the tier list used elsewhere in the app (pro/business/
 *    enterprise/premium/growth + the *_3m/_6m/_12m starter ids), while
 *    free_trial/trial/free/basic are treated as non-paying.
 *
 * The module is import-safe from both the local Express bootstrap (`server.ts`)
 * and the Vercel serverless function (`api/admin/analytics.ts`).
 */

import { connectToDatabase, getMongoUri, describeMongoError, DB_NAME } from './db.js';

export interface PlatformOverview {
  /** Sum of completed order totals across every store, in BDT. */
  totalPlatformSalesBDT: number;
  /** Count of every order created platform-wide (any status). */
  totalOrderVolume: number;
  /** Count of orders counted as completed (Delivered/Completed). */
  completedOrderCount: number;
  /** Total earnings from active paid subscriptions, in BDT. */
  baasSubscriptionRevenueBDT: number;
  /** Count of active (non-locked) merchant stores on the platform. */
  activeMerchants: number;
  /** Count of every store record found, including locked/trial ones. */
  totalMerchants: number;
  /** Count of stores currently on a paid plan. */
  paidMerchants: number;
  /** Average order value across completed orders, in BDT. */
  averageOrderValueBDT: number;
}

export interface TopStore {
  storeId: string;
  storeName: string;
  storeSlug: string;
  subscriptionPlan: string;
  orderCount: number;
  completedOrderCount: number;
  totalSalesBDT: number;
  averageOrderValueBDT: number;
}

export interface RecentRenewal {
  id: string;
  storeName: string;
  storeSlug: string;
  planId: string;
  planName: string;
  amountBDT: number;
  paymentMethod: string;
  transactionId: string;
  status: string;
  /** ISO timestamp of the renewal / approval event. */
  date: string;
}

export interface PlatformAnalyticsResult {
  ok: boolean;
  generatedAt: string;
  database: string;
  overview: PlatformOverview;
  topStores: TopStore[];
  recentRenewals: RecentRenewal[];
  error?: string;
  /** Structured DB diagnosis (code + actionable message) when the read failed. */
  dbError?: { code: string; message: string; detail?: string };
  /** Which providers contributed rows to this payload. */
  sources?: string[];
  /** Present when MongoDB counts were empty and Supabase supplied a backup. */
  supabaseFallback?: {
    merchantCount: number | null;
    subscriptionCount: number | null;
    domainCount: number | null;
    error?: string;
  };
}

/** Human-readable labels for the plan ids used across the app. */
const PLAN_LABELS: Record<string, string> = {
  free_trial: 'Free Trial',
  trial: 'Free Trial',
  free: 'Free',
  starter_1m: 'Starter (1 Month)',
  starter_3m: 'Starter (3 Months)',
  pro_6m: 'Pro (6 Months)',
  enterprise_12m: 'Enterprise (12 Months)',
};

/** Non-paying plan ids — everything else is considered a paid subscription. */
const NON_PAID_PLANS = new Set(['free_trial', 'trial', 'free', 'basic', 'starter', '']);

/** Order statuses that are explicitly NOT revenue. */
const VOID_STATUSES = new Set(['cancelled', 'canceled', 'returned', 'refunded', 'failed']);

export function getPlanLabel(planId: string): string {
  const key = String(planId || 'free_trial').toLowerCase();
  if (PLAN_LABELS[key]) return PLAN_LABELS[key];
  return key
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function isPaidPlan(planId: string): boolean {
  const key = String(planId || '').toLowerCase().trim();
  if (NON_PAID_PLANS.has(key)) return false;
  if (key.includes('pro') || key.includes('enterprise') || key.includes('business') || key.includes('premium') || key.includes('growth')) return true;
  // Any id containing a paid duration marker (e.g. starter_3m) is paid.
  return /(?:^|_)(1m|3m|6m|12m)$/.test(key) || /(?:^|_)(1|3|6|12)$/.test(key);
}

/** Price table used to value a subscription when no explicit amount is stored. */
const PLAN_PRICE_BDT: Record<string, number> = {
  starter_1m: 500,
  starter_3m: 1300,
  pro_6m: 2400,
  enterprise_12m: 4200,
};

/** Fall back to the plan's catalog price when a record stores no amount. */
function implicitPlanPrice(planId: string): number {
  const key = String(planId || '').toLowerCase().trim();
  if (PLAN_PRICE_BDT[key] !== undefined) return PLAN_PRICE_BDT[key];
  if (key.includes('enterprise') || key.includes('12m') || key === '12') return PLAN_PRICE_BDT.enterprise_12m;
  if (key.includes('pro') || key.includes('6m') || key === '6') return PLAN_PRICE_BDT.pro_6m;
  if (key.includes('starter_3m') || key.includes('3m') || key === '3') return PLAN_PRICE_BDT.starter_3m;
  if (key.includes('starter') || key.includes('1m') || key === '1') return PLAN_PRICE_BDT.starter_1m;
  return 0;
}

/** Coerce any value (string/number/undefined) to a finite number, else fallback. */
function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.\-]/g, '');
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/** Pick the first defined, non-empty value from a list of candidate fields. */
function pick(record: Record<string, any>, keys: string[]): any {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

/** Best-effort ISO timestamp from whichever date field the record carries. */
function toIso(value: unknown): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

function planIdOf(record: Record<string, any> | null | undefined): string {
  if (!record) return 'free_trial';
  return String(
    pick(record, ['subscription_plan', 'subscriptionPlan', 'plan', 'planId', 'plan_id']) || 'free_trial'
  ).toLowerCase();
}

/**
 * Aggregate the platform-wide analytics for the Super Admin Portal.
 *
 * @param dbName override the database (defaults to the shared `zidbdsaas`).
 */
export async function getPlatformAnalytics(dbName: string = DB_NAME): Promise<PlatformAnalyticsResult> {
  const emptyOverview: PlatformOverview = {
    totalPlatformSalesBDT: 0,
    totalOrderVolume: 0,
    completedOrderCount: 0,
    baasSubscriptionRevenueBDT: 0,
    activeMerchants: 0,
    totalMerchants: 0,
    paidMerchants: 0,
    averageOrderValueBDT: 0,
  };

  const base: PlatformAnalyticsResult = {
    ok: true,
    generatedAt: new Date().toISOString(),
    database: dbName,
    overview: emptyOverview,
    topStores: [],
    recentRenewals: [],
  };

  if (!getMongoUri()) {
    const failure = describeMongoError(new Error('MONGODB_URI is not set'));
    return { ...base, ok: false, error: failure.message, dbError: failure };
  }

  let db: any = null;
  try {
    const mongoose = await connectToDatabase(dbName);
    db = mongoose.connection.db;
  } catch (err: any) {
    // Report WHY (credentials, DNS, timeout) instead of a raw driver string.
    const failure = describeMongoError(err);
    console.error('[adminAnalytics] MongoDB connection failed:', failure.detail || failure.message);
    return { ...base, ok: false, error: failure.message, dbError: failure };
  }
  if (!db) {
    const failure = describeMongoError(new Error('connection handle unavailable'));
    return { ...base, ok: false, error: failure.message, dbError: failure };
  }

  const safeAggregate = async (collection: string, pipeline: any[]): Promise<any[]> => {
    try {
      return await db.collection(collection).aggregate(pipeline).toArray();
    } catch (err: any) {
      // Missing collection / index issues must not break the whole dashboard.
      console.warn(`[adminAnalytics] aggregate ${collection} warning:`, err?.message || err);
      return [];
    }
  };

  // ── 1. Orders: platform-wide sales + volume ────────────────────────────────
  // Status is matched in JS (case-insensitive) because the pipeline writes a
  // mix of 'New'/'Processing'/'Delivered' and legacy capitalisations.
  let totalOrderVolume = 0;
  let totalPlatformSalesBDT = 0;
  let completedOrderCount = 0;

  const orderTotals = await safeAggregate('orders', [
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        // Sum only orders whose status is a completed one (regex, case-insensitive).
        sales: {
          $sum: {
            $cond: [
              {
                $regexMatch: {
                  input: { $ifNull: ['$status', ''] },
                  regex: '^(delivered|completed|complete|paid)$',
                  options: 'i',
                },
              },
              {
                $convert: {
                  input: { $ifNull: ['$total_price', 0] },
                  to: 'double',
                  onError: 0,
                  onNull: 0,
                },
              },
              0,
            ],
          },
        },
        completed: {
          $sum: {
            $cond: [
              {
                $regexMatch: {
                  input: { $ifNull: ['$status', ''] },
                  regex: '^(delivered|completed|complete|paid)$',
                  options: 'i',
                },
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  if (orderTotals.length > 0) {
    totalOrderVolume = toNumber(orderTotals[0].count, 0);
    totalPlatformSalesBDT = toNumber(orderTotals[0].sales, 0);
    completedOrderCount = toNumber(orderTotals[0].completed, 0);
  }

  // ── 2. Stores: active merchant counts, plan distribution ───────────────────
  let allStores: Record<string, any>[] = [];
  try {
    allStores = await db.collection('stores').find({}).limit(5000).toArray();
  } catch (err: any) {
    console.warn('[adminAnalytics] stores lookup warning:', err?.message || err);
    // Legacy deployments keep merchant records in a `merchants` collection.
    try {
      allStores = await db.collection('merchants').find({}).limit(5000).toArray();
    } catch (innerErr: any) {
      console.warn('[adminAnalytics] merchants lookup warning:', innerErr?.message || innerErr);
      allStores = [];
    }
  }

  // `let` because the Supabase fallback below can raise these when MongoDB has
  // no store rows at all but Supabase's real-time mirror does.
  let totalMerchants = allStores.length;
  let activeMerchants = 0;
  let paidMerchants = 0;
  for (const store of allStores) {
    const locked = store?.isLocked === true || String(store?.status || '').toLowerCase() === 'suspended';
    if (!locked) activeMerchants += 1;
    if (isPaidPlan(planIdOf(store))) {
      paidMerchants += 1;
    }
  }

  // ── 3. Subscriptions: BaaS revenue from active paid subscriptions ──────────
  // Prefer an explicit amount field; otherwise fall back to the plan catalog
  // price so a platform with active paid plans still reports revenue.
  let baasSubscriptionRevenueBDT = 0;
  let subscriptionDocs: Record<string, any>[] = [];
  try {
    subscriptionDocs = await db
      .collection('subscriptions')
      .find({})
      .sort({ created_at: -1, updated_at: -1, _id: -1 })
      .limit(1000)
      .toArray();
  } catch (err: any) {
    console.warn('[adminAnalytics] subscriptions lookup warning:', err?.message || err);
    subscriptionDocs = [];
  }

  for (const sub of subscriptionDocs) {
    const status = String(pick(sub, ['status', 'payment_status', 'subscription_status']) || 'active').toLowerCase();
    // Only active (non-cancelled/expired/failed) subscriptions earn revenue.
    if (VOID_STATUSES.has(status) || status === 'expired' || status === 'inactive') continue;
    const plan = planIdOf(sub);
    if (!isPaidPlan(plan)) continue;
    const explicit = pick(sub, ['amountBDT', 'amount_bdt', 'amount', 'price', 'priceBDT', 'paid_amount']);
    const amount = explicit !== undefined ? toNumber(explicit, 0) : implicitPlanPrice(plan);
    baasSubscriptionRevenueBDT += amount;
  }

  // If the subscriptions collection is absent/empty, value the platform's paid
  // stores directly from their plan (the store record is the source of truth).
  if (subscriptionDocs.length === 0) {
    for (const store of allStores) {
      const plan = planIdOf(store);
      if (!isPaidPlan(plan)) continue;
      const explicit = pick(store, ['amountBDT', 'amount_bdt', 'paid_amount', 'subscription_amount']);
      baasSubscriptionRevenueBDT += explicit !== undefined ? toNumber(explicit, 0) : implicitPlanPrice(plan);
    }
  }

  // ── 4. Top revenue generating stores (orders aggregated per store) ─────────
  // Normalise each order's store reference (UUID / slug / merchant id) so the
  // per-store aggregation keys match the store records we loaded above.
  const storeBySlug = new Map<string, Record<string, any>>();
  const storeById = new Map<string, Record<string, any>>();
  for (const store of allStores) {
    const slug = String(pick(store, ['store_slug', 'storeSlug', 'slug']) || '').toLowerCase();
    const id = String(pick(store, ['id', 'store_id', 'storeId', '_id']) || '');
    if (slug) storeBySlug.set(slug, store);
    if (id) storeById.set(id, store);
  }

  const orderAgg = await safeAggregate('orders', [
    {
      $group: {
        _id: {
          $ifNull: [
            '$store_slug',
            { $ifNull: ['$storeSlug', { $ifNull: ['$store_id', '$merchant_id'] }] },
          ],
        },
        orderCount: { $sum: 1 },
        completedOrderCount: {
          $sum: {
            $cond: [
              {
                $regexMatch: {
                  input: { $ifNull: ['$status', ''] },
                  regex: '^(delivered|completed|complete|paid)$',
                  options: 'i',
                },
              },
              1,
              0,
            ],
          },
        },
        totalSalesBDT: {
          $sum: {
            $cond: [
              {
                $regexMatch: {
                  input: { $ifNull: ['$status', ''] },
                  regex: '^(delivered|completed|complete|paid)$',
                  options: 'i',
                },
              },
              {
                $convert: {
                  input: { $ifNull: ['$total_price', 0] },
                  to: 'double',
                  onError: 0,
                  onNull: 0,
                },
              },
              0,
            ],
          },
        },
      },
    },
  ]);

  const topStores: TopStore[] = orderAgg
    .map((row: any) => {
      const key = String(row?._id || '').toLowerCase();
      const store = storeBySlug.get(key) || storeById.get(String(row?._id || '')) || null;
      const orderCount = toNumber(row?.orderCount, 0);
      const totalSalesBDT = toNumber(row?.totalSalesBDT, 0);
      const completedOrderCount = toNumber(row?.completedOrderCount, 0);
      return {
        storeId: String(store ? pick(store, ['id', 'store_id', 'storeId', '_id']) || key : key),
        storeName: String(
          store ? pick(store, ['store_name', 'storeName', 'name']) || key : key
        ) || 'Unknown Store',
        storeSlug: String(
          store ? pick(store, ['store_slug', 'storeSlug', 'slug']) || key : key
        ),
        subscriptionPlan: store ? planIdOf(store) : 'free_trial',
        orderCount,
        completedOrderCount,
        totalSalesBDT,
        averageOrderValueBDT: completedOrderCount > 0 ? Math.round(totalSalesBDT / completedOrderCount) : 0,
      };
    })
    // Sort by revenue first, then order volume as the tiebreaker.
    .sort((a, b) => (b.totalSalesBDT - a.totalSalesBDT) || (b.orderCount - a.orderCount))
    .slice(0, 8);

  // ── 5. Recent subscription renewals ────────────────────────
  // Prefer explicit `subscriptions` documents; if none exist fall back to the
  // approved subscription requests that the admin workflow records.
  const renewals: RecentRenewal[] = [];

  for (const sub of subscriptionDocs) {
    const plan = planIdOf(sub);
    const explicit = pick(sub, ['amountBDT', 'amount_bdt', 'amount', 'price', 'priceBDT', 'paid_amount']);
    renewals.push({
      id: String(pick(sub, ['id', '_id']) || `sub-${renewals.length}`),
      storeName: String(pick(sub, ['store_name', 'storeName', 'merchant_name', 'merchant_email']) || 'Store'),
      storeSlug: String(pick(sub, ['store_slug', 'storeSlug', 'slug']) || ''),
      planId: plan,
      planName: getPlanLabel(plan),
      amountBDT: explicit !== undefined ? toNumber(explicit, 0) : implicitPlanPrice(plan),
      paymentMethod: String(pick(sub, ['payment_method', 'paymentMethod']) || 'Admin'),
      transactionId: String(pick(sub, ['transaction_id', 'transactionId', 'trx_id']) || '—'),
      status: String(pick(sub, ['status']) || 'active'),
      date: toIso(pick(sub, ['renewed_at', 'created_at', 'updated_at', 'plan_started_at', 'expires_at'])),
    });
  }

  if (renewals.length === 0) {
    let requestDocs: Record<string, any>[] = [];
    try {
      requestDocs = await db
        .collection('subscription_requests')
        .find({})
        .sort({ created_at: -1, _id: -1 })
        .limit(500)
        .toArray();
    } catch (err: any) {
      console.warn('[adminAnalytics] subscription_requests lookup warning:', err?.message || err);
      requestDocs = [];
    }

    for (const req of requestDocs) {
      const status = String(pick(req, ['status']) || '').toLowerCase();
      if (status !== 'approved' && status !== 'active' && status !== 'completed') continue;
      const plan = String(pick(req, ['planId', 'plan_id', 'plan', 'subscription_plan']) || 'free_trial').toLowerCase();
      renewals.push({
        id: String(pick(req, ['id', '_id']) || `req-${renewals.length}`),
        storeName: String(pick(req, ['storeName', 'store_name', 'merchant_email']) || 'Store'),
        storeSlug: String(pick(req, ['storeSlug', 'store_slug']) || ''),
        planId: plan,
        planName: String(pick(req, ['planName', 'plan_name']) || getPlanLabel(plan)),
        amountBDT: toNumber(pick(req, ['amountBDT', 'amount_bdt', 'amount']), 0),
        paymentMethod: String(pick(req, ['paymentMethod', 'payment_method']) || 'Admin').replace(/_admin$/, ''),
        transactionId: String(pick(req, ['transactionId', 'transaction_id']) || '—'),
        status: 'approved',
        date: toIso(pick(req, ['processedAt', 'updated_at', 'created_at', 'submittedAt'])),
      });
    }
  }

  renewals.sort((a, b) => {
    const ta = a.date ? new Date(a.date).getTime() : 0;
    const tb = b.date ? new Date(b.date).getTime() : 0;
    return tb - ta;
  });

  // ── Hybrid secondary source ───────────────────────────────
  // MongoDB is authoritative. When a COUNT metric came back empty/zero we ask
  // Supabase (the real-time mirror of `merchants`/`subscriptions`/`domains`) and
  // backfill it, so a store that only exists in Supabase is still counted. Money
  // metrics are NEVER invented from Supabase — only the counts it can prove.
  let supabaseFallback: { merchantCount: number | null; subscriptionCount: number | null; domainCount: number | null; error?: string } | null = null;
  const mongodbCountsEmpty = totalMerchants === 0 && activeMerchants === 0 && paidMerchants === 0;
  if (mongodbCountsEmpty) {
    try {
      const { fetchSupabaseMetricFallback } = await import('./hybridDb.js');
      supabaseFallback = await fetchSupabaseMetricFallback();
      if (typeof supabaseFallback?.merchantCount === 'number' && supabaseFallback.merchantCount > 0) {
        // Supabase knows about merchants Mongo does not — surface the count so
        // the dashboard is not left showing a misleading zero.
        totalMerchants = supabaseFallback.merchantCount;
        if (activeMerchants === 0) activeMerchants = supabaseFallback.merchantCount;
      }
    } catch (err: any) {
      console.warn('[adminAnalytics] Supabase fallback warning:', err?.message || err);
    }
  }

  const sources: string[] = ['mongodb'];
  if (
    supabaseFallback &&
    (supabaseFallback.merchantCount !== null ||
      supabaseFallback.subscriptionCount !== null ||
      supabaseFallback.domainCount !== null)
  ) {
    sources.push('supabase');
  }

  const overview: PlatformOverview = {
    totalPlatformSalesBDT: Math.round(totalPlatformSalesBDT),
    totalOrderVolume,
    completedOrderCount,
    baasSubscriptionRevenueBDT: Math.round(baasSubscriptionRevenueBDT),
    activeMerchants,
    totalMerchants,
    paidMerchants,
    averageOrderValueBDT: completedOrderCount > 0 ? Math.round(totalPlatformSalesBDT / completedOrderCount) : 0,
  };

  return {
    ...base,
    overview,
    topStores,
    recentRenewals: renewals.slice(0, 10),
    // Which providers contributed — lets the UI explain a partial number.
    sources,
    ...(supabaseFallback
      ? {
          supabaseFallback: {
            merchantCount: supabaseFallback.merchantCount,
            subscriptionCount: supabaseFallback.subscriptionCount,
            domainCount: supabaseFallback.domainCount,
            error: supabaseFallback.error,
          },
        }
      : {}),
  };
}

export default getPlatformAnalytics;

/**
 * Resolve the Gemini API key from either spelling Vercel may hold it under.
 *
 * Vercel projects created from the AI Studio template expose the key as
 * VITE_GEMINI_API_KEY, while a hand-configured project usually uses the
 * server-only GEMINI_API_KEY. Both are accepted everywhere; only the server
 * reads them, so the key is never shipped into the browser bundle.
 *
 * Returns '' when nothing usable is configured (missing, blank, or still the
 * placeholder from .env.example) — callers then serve the deterministic
 * fallback summary instead of erroring.
 */
export function getGeminiApiKey(): string {
  const raw = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
  const key = String(raw).trim();
  if (!key || key === 'MY_GEMINI_API_KEY') return '';
  return key;
}

/** True when `value` carries at least one usable metric (so 0 counts as real). */
function hasMetric(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

/**
 * Pick the overview numbers from an analytics payload.
 *
 * Two shapes reach this helper:
 *   - a full PlatformAnalyticsResult / platformAnalytics document (has .overview)
 *   - the flat `overview` object itself
 *
 * The `dbMetrics` argument is the authoritative fallback: when the request
 * carries no/incomplete numbers (for example the AI panel was opened before
 * /api/admin/analytics answered, or MongoDB was unreachable) the summary is
 * still built from what the server itself calculated from the database.
 */
export function normalizeAnalyticsOverview(analyticsData: any, dbMetrics?: any): PlatformOverview {
  const provided = analyticsData?.overview || analyticsData || {};
  const fromDb = dbMetrics || {};
  const pick = (field: keyof PlatformOverview): number => {
    if (hasMetric(provided[field])) return Number(provided[field]) || 0;
    return Number(fromDb[field]) || 0;
  };
  return {
    totalPlatformSalesBDT: pick('totalPlatformSalesBDT'),
    totalOrderVolume: pick('totalOrderVolume'),
    completedOrderCount: pick('completedOrderCount'),
    baasSubscriptionRevenueBDT: pick('baasSubscriptionRevenueBDT'),
    activeMerchants: pick('activeMerchants'),
    totalMerchants: pick('totalMerchants'),
    paidMerchants: pick('paidMerchants'),
    averageOrderValueBDT: pick('averageOrderValueBDT'),
  };
}

/**
 * Build the natural-language prompt that turns the platform analytics payload
 * into a short executive briefing for the Super Admin AI panel.
 *
 * Shared by the local dev Express route (server.ts) and the Vercel functions
 * (api/server.ts + api/ai/analytics-summary.ts) so the summary is identical in
 * every environment.
 */
export function buildAnalyticsSummaryPrompt(analyticsData: any, dbMetrics?: any): string {
  const overview = normalizeAnalyticsOverview(analyticsData, dbMetrics);
  const topStores = Array.isArray(analyticsData?.topStores) ? analyticsData.topStores : [];
  const renewals = Array.isArray(analyticsData?.recentRenewals) ? analyticsData.recentRenewals : [];

  const topStoresText = topStores
    .slice(0, 5)
    .map((s: any, i: number) => `${i + 1}. ${s?.storeName || 'Store'} — ৳${Number(s?.totalSalesBDT || 0).toLocaleString()} BDT across ${s?.orderCount || 0} orders`)
    .join('\n') || 'No store has recorded sales yet.';

  const renewalsText = renewals
    .slice(0, 5)
    .map((r: any) => `- ${r?.storeName || 'Store'} renewed ${r?.planName || r?.planId || 'a plan'} (৳${Number(r?.amountBDT || 0).toLocaleString()} BDT, ${r?.paymentMethod || 'Admin'})`)
    .join('\n') || 'No subscription renewals recorded yet.';

  return `You are the platform operations analyst for the Zid SaaS e-commerce platform (Bangladesh). Write a concise EXECUTIVE SUMMARY (4-6 short bullet points, professional English) for the Super Admin based on this platform-wide data. Highlight growth signals, risks, and 1-2 concrete recommendations. Do not invent numbers beyond what is given.

PLATFORM METRICS:
- Total Platform Sales (completed orders): ${Number(overview.totalPlatformSalesBDT || 0).toLocaleString()} BDT
- Total Order Volume (all statuses): ${Number(overview.totalOrderVolume || 0).toLocaleString()} orders
- Completed Orders: ${Number(overview.completedOrderCount || 0).toLocaleString()}
- BaaS Subscription Revenue: ${Number(overview.baasSubscriptionRevenueBDT || 0).toLocaleString()} BDT
- Active Merchants: ${Number(overview.activeMerchants || 0).toLocaleString()} (paid: ${Number(overview.paidMerchants || 0).toLocaleString()})
- Average Order Value: ${Number(overview.averageOrderValueBDT || 0).toLocaleString()} BDT

TOP REVENUE STORES:
${topStoresText}

RECENT RENEWALS:
${renewalsText}

Respond with the executive summary only — no preamble.`;
}

/**
 * Deterministic fallback summary used when the AI key is absent or the call
 * fails. Always returns a non-empty human-readable string built from the DB
 * metrics, so the AI panel renders content even with no key and no request body.
 */
export function buildFallbackSummary(analyticsData: any, dbMetrics?: any): string {
  const overview = normalizeAnalyticsOverview(analyticsData, dbMetrics);
  const topStores = Array.isArray(analyticsData?.topStores) ? analyticsData.topStores : [];
  const sales = Number(overview.totalPlatformSalesBDT || 0).toLocaleString();
  const volume = Number(overview.totalOrderVolume || 0).toLocaleString();
  const orders = Number(overview.completedOrderCount || 0).toLocaleString();
  const subsRevenue = Number(overview.baasSubscriptionRevenueBDT || 0).toLocaleString();
  const active = Number(overview.activeMerchants || 0).toLocaleString();
  const paid = Number(overview.paidMerchants || 0).toLocaleString();
  const aov = Number(overview.averageOrderValueBDT || 0).toLocaleString();
  const leader = topStores[0];
  const storeCount = Number(overview.totalMerchants || overview.activeMerchants || 0).toLocaleString();

  // Zero-data case. When BOTH providers returned nothing there is no signal to
  // interpret, so emit one explicit sentence rather than three empty metrics.
  // This is the guaranteed, never-failing string the dashboard renders.
  const hasNoData =
    Number(overview.totalPlatformSalesBDT || 0) === 0 &&
    Number(overview.totalOrderVolume || 0) === 0 &&
    Number(overview.completedOrderCount || 0) === 0 &&
    Number(overview.baasSubscriptionRevenueBDT || 0) === 0;

  if (hasNoData) {
    return `Current platform analytics: Total Sales 0 BDT across ${storeCount} onboarded stores.`;
  }

  const lines = [
    `Platform sales stand at ৳${sales} BDT from ${orders} completed orders (out of ${volume} total).`,
    `Recurring BaaS subscription revenue is ৳${subsRevenue} BDT across ${active} active merchants (${paid} on paid plans).`,
    `Average order value is ৳${aov} BDT.`,
  ];
  if (leader) {
    lines.push(`"${leader.storeName}" leads revenue with ৳${Number(leader.totalSalesBDT || 0).toLocaleString()} BDT.`);
  }
  lines.push(
    Number(overview.totalOrderVolume || 0) === 0
      ? 'Recommendation: drive merchant onboarding — no orders have been recorded platform-wide yet.'
      : 'Recommendation: review top-performing stores for upsell opportunities and watch subscription churn.'
  );
  return lines.join('\n');
}
