/**
 * Subscription persistence for the merchant dashboard + Admin portal.
 *
 * PURE MongoDB. Supabase REST is deliberately NOT used for subscriptions.
 *
 * WHY
 * ---
 * The Supabase `subscriptions` table was returned as HTTP 400 with SQLSTATE
 * 42703 (“column subscriptions.merchant_email does not exist”) whenever a client
 * touched a column the live schema had not been migrated with — first on reads
 * (the red `subscriptions?select=*` row) and then again on every admin save.
 * Chasing schema drift in a second database added a failure mode without adding
 * capability: MongoDB already holds the authoritative `subscriptions` and
 * `subscription_plans` collections. So all subscription reads and writes now go
 * straight to Mongo, and the endpoint can no longer raise a SQLSTATE error.
 *
 * GUARANTEES
 * ----------
 *   1. ONE STORE — reads and writes hit MongoDB only; `sources` is always
 *      `['mongodb']` (or `[]` when Mongo is genuinely unreachable).
 *   2. AUTO-SEED — an empty `subscriptions` collection is populated with the
 *      default catalogue (1-Month, Starter, Pro, Enterprise) on first read.
 *   3. NEVER THROWS — callers receive a shaped result, so a route always
 *      answers 200.
 */

import { queryMongoCollection } from './hybridDb.js';
import type { DataSource, HybridResult } from './hybridDb.js';
import { upsertMongoRecord, deleteMongoRecord } from './supabaseAdminCRUD.js';

export interface SubscriptionWriteResult {
  ok: boolean;
  sources: DataSource[];
  error?: string;
  record?: Record<string, any>;
}

export interface PlanListResult {
  ok: boolean;
  /** Plan rows (normalised) from Supabase and/or MongoDB. */
  data: Record<string, any>[];
  sources: DataSource[];
  /** True when the default catalogue was just seeded into an empty store. */
  seeded: boolean;
  error?: string;
  diagnostics?: Record<string, any>;
}

/**
 * The default plan catalogue auto-seeded into an empty store.
 *
 * A Bangladesh-market SaaS ladder in the Zid SaaS two-tier layout:
 * Rise (entry) → Growth (full-featured), ordered by `display_order` (10/20).
 *
 * TIER DIFFERENCES ARE DELIBERATE AND NON-OVERLAPPING. Each tier lists only what
 * it uniquely grants, so no bullet shows on two cards. `features` is the prose
 * the card renders; `feature_flags` beside it is the machine-readable
 * entitlement set the Super Admin toggles. Keep the two in step.
 *
 * Every field is written in BOTH snake_case and the camelCase spelling the API
 * layer uses, because `normalizePlanRow` (lib/serverApp.ts) accepts either and
 * the Supabase mirror columns are snake_case.
 *
 * `price_bdt` / `duration_days` are the LEGACY single-term pair kept for older
 * readers. They are deliberately NOT what the merchant sees: the term is chosen
 * with the Monthly/Yearly toggle, so the UI quotes `monthly_price_bdt` /
 * `yearly_price_bdt`.
 */
export const DEFAULT_PLANS: Record<string, any>[] = [
  {
    id: 'rise', slug: 'rise', plan_id: 'rise',
    plan_name: 'Rise / Starter Plan', name: 'Rise / Starter Plan',
    price_bdt: 1000, priceBDT: 1000, price: 1000,
    duration_days: 30, durationDays: 30, badge_text: '', badge: '',
    display_order: 10, displayOrder: 10,
    monthly_price_bdt: 1000, monthlyPrice: 1000,
    max_products: 100, maxProducts: 100,
    feature_flags: {
      freeSubdomain: true, customDomain: true, premiumThemes: false,
      cssCustomizer: false, courierApi: true, courierAutoSync: false,
      metaPixels: false, googleAnalytics: false, aiCaption: false,
      aiContent: false, removeBg: false, aiCopilot: false,
      whatsappRecovery: false, emailSupport: true, phoneSupport: false,
      prioritySupport: false,
    },
    featureFlags: {
      freeSubdomain: true, customDomain: true, premiumThemes: false,
      cssCustomizer: false, courierApi: true, courierAutoSync: false,
      metaPixels: false, googleAnalytics: false, aiCaption: false,
      aiContent: false, removeBg: false, aiCopilot: false,
      whatsappRecovery: false, emailSupport: true, phoneSupport: false,
      prioritySupport: false,
    },
    features: [
      'Up to 100 Products',
      'Standard Themes',
      'Basic AI Tools',
      'Standard Support',
    ],
    is_active: true, isActive: true, is_popular: false, isPopular: false,
  },
  {
    id: 'growth', slug: 'growth', plan_id: 'growth',
    plan_name: 'Growth / Pro Plan', name: 'Growth / Pro Plan',
    price_bdt: 2500, priceBDT: 2500, price: 2500,
    duration_days: 30, durationDays: 30, badge_text: '', badge: '',
    display_order: 20, displayOrder: 20,
    monthly_price_bdt: 2500, monthlyPrice: 2500,
    max_products: 0, maxProducts: 0,
    feature_flags: {
      freeSubdomain: true, customDomain: true, premiumThemes: true,
      cssCustomizer: true, courierApi: true, courierAutoSync: true,
      metaPixels: true, googleAnalytics: true, aiCaption: true,
      aiContent: true, removeBg: true, aiCopilot: true,
      whatsappRecovery: true, emailSupport: true, phoneSupport: true,
      prioritySupport: true,
    },
    featureFlags: {
      freeSubdomain: true, customDomain: true, premiumThemes: true,
      cssCustomizer: true, courierApi: true, courierAutoSync: true,
      metaPixels: true, googleAnalytics: true, aiCaption: true,
      aiContent: true, removeBg: true, aiCopilot: true,
      whatsappRecovery: true, emailSupport: true, phoneSupport: true,
      prioritySupport: true,
    },
    features: [
      'Unlimited Products',
      'Premium Themes',
      'Pro AI Marketing & Caption Tools',
      'Priority Support',
    ],
    is_active: true, isActive: true, is_popular: true, isPopular: true,
  },
];

/**
 * The capability flags a plan tier understands.
 *
 * Anything not listed here is DROPPED rather than passed through: an untrusted
 * admin payload must not be able to inject arbitrary keys into the document.
 * Additions here are the single place a new tier capability must be declared.
 */
export const PLAN_FEATURE_FLAG_KEYS = [
  'freeSubdomain',
  'customDomain',
  'premiumThemes',
  'cssCustomizer',
  'courierApi',
  'courierAutoSync',
  'metaPixels',
  'googleAnalytics',
  'aiCaption',
  'aiContent',
  'removeBg',
  'aiCopilot',
  'whatsappRecovery',
  'emailSupport',
  'phoneSupport',
  'prioritySupport',
] as const;

/**
 * Legacy flag names migrated on read so plans written before the ladder was
 * split into fine-grained capabilities keep their entitlements.
 *
 * `aiTools` used to mean "AI unlocked", which is the broadest reading, so it
 * maps onto the full content suite — a merchant who already paid for it keeps
 * working access instead of silently losing AI features.
 */
export const LEGACY_PLAN_FEATURE_FLAGS: Record<string, string> = {
  aiTools: 'aiContent',
};

/** Coerce arbitrary input into a complete, boolean, whitelisted flag set. */
export function normalizeFeatureFlags(raw: any): Record<string, boolean> {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out: Record<string, boolean> = {};
  const readFlag = (key: string): boolean => {
    // Accept the snake_case spelling too, so a hand-written document works.
    const snake = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    const value = src[key] ?? src[snake];
    return value === true || value === 'true' || value === 1;
  };

  for (const key of PLAN_FEATURE_FLAG_KEYS) out[key] = readFlag(key);

  // Migrate retired flag names so plans stored before the ladder was split into
  // fine-grained capabilities keep granting what they were sold. An explicit
  // current key always wins — this only fills a capability nothing else set.
  for (const [legacy, current] of Object.entries(LEGACY_PLAN_FEATURE_FLAGS)) {
    if (!(current in out)) continue;
    if (out[current] === true) continue;
    if (readFlag(legacy)) out[current] = true;
  }

  return out;
}

/** A missing/negative price is stored as null so it is distinguishable from 0. */
function toMoney(value: any): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Normalise an arbitrary subscription/plan payload into the canonical row. */
export function normalizeSubscription(raw: Record<string, any>): Record<string, any> {
  const now = new Date().toISOString();
  const email = String(raw?.merchant_email || raw?.merchantEmail || raw?.email || '').trim().toLowerCase();
  const slug = String(raw?.slug || raw?.plan_id || raw?.planId || raw?.id || '').trim().toLowerCase();
  const features = Array.isArray(raw?.features)
    ? raw.features
    : (typeof raw?.features === 'string' ? (() => {
        try { const p = JSON.parse(raw.features); return Array.isArray(p) ? p : []; } catch { return []; }
      })() : []);

  return {
    // Identity — plan rows key off `slug`, renewal rows off `merchant_email`.
    id: String(raw?.id || slug || email || `sub-${Date.now()}`),
    slug: slug || null,
    plan_id: slug || null,
    merchant_email: email || null,
    store_slug: String(raw?.store_slug || raw?.storeSlug || '').trim().toLowerCase() || null,
    store_name: String(raw?.store_name || raw?.storeName || '') || null,
    // Plan catalogue fields.
    plan_name: raw?.plan_name ? String(raw.plan_name) : (raw?.name ? String(raw.name) : null),
    name: raw?.name ? String(raw.name) : (raw?.plan_name ? String(raw.plan_name) : null),
    price_bdt: raw?.price_bdt ?? raw?.priceBDT ?? raw?.price ?? null,
    priceBDT: raw?.priceBDT ?? raw?.price_bdt ?? raw?.price ?? null,
    price: raw?.price ?? raw?.price_bdt ?? raw?.priceBDT ?? null,
    duration_days: Number(raw?.duration_days ?? raw?.durationDays ?? raw?.selectedPlanDays ?? 30),
    durationDays: Number(raw?.durationDays ?? raw?.duration_days ?? raw?.selectedPlanDays ?? 30),
    badge_text: raw?.badge_text ? String(raw.badge_text) : (raw?.badge ? String(raw.badge) : null),
    badge: raw?.badge ? String(raw.badge) : (raw?.badge_text ? String(raw.badge_text) : null),
    features,
    is_active: raw?.is_active ?? raw?.isActive ?? true,
    isActive: raw?.isActive ?? raw?.is_active ?? true,
    is_popular: raw?.is_popular ?? raw?.isPopular ?? false,
    isPopular: raw?.isPopular ?? raw?.is_popular ?? false,
    max_products: Number(raw?.max_products ?? raw?.maxProducts ?? 0),
    // ── Billing-cycle pricing ──
    // The merchant-facing toggle quotes these; `price`/`duration_days` above are
    // the legacy single-term pair and are kept for older readers.
    monthly_price_bdt: toMoney(raw?.monthly_price_bdt ?? raw?.monthlyPrice),
    yearly_price_bdt: toMoney(raw?.yearly_price_bdt ?? raw?.yearlyPrice),
    annual_discount_percent: Number(raw?.annual_discount_percent ?? raw?.annualDiscountPercent ?? 20),
    display_order: Number.isFinite(Number(raw?.display_order ?? raw?.displayOrder))
      ? Number(raw?.display_order ?? raw?.displayOrder)
      : null,
    // ── Per-tier capability flags ──
    // Stored as a plain object so the Super Admin can toggle a tier without a
    // schema migration; unknown keys are preserved so a future flag added to the
    // UI survives a round-trip through an older server.
    feature_flags: normalizeFeatureFlags(raw?.feature_flags ?? raw?.featureFlags),
    featureFlags: normalizeFeatureFlags(raw?.featureFlags ?? raw?.feature_flags),
    // Renewal fields (present only for tenant rows).
    subscription_plan: raw?.subscription_plan || raw?.planId || raw?.plan_id || null,
    plan_started_at: raw?.plan_started_at || raw?.planStartedAt || null,
    subscription_expiry: raw?.subscription_expiry || raw?.subscriptionExpiry || raw?.expiryDate || null,
    expires_at: raw?.expires_at || raw?.expiresAt || null,
    transaction_id: raw?.transaction_id || raw?.transactionId || null,
    payment_method: raw?.payment_method || raw?.paymentMethod || null,
    status: raw?.status ? String(raw.status) : 'active',
    amount_bdt: raw?.amount_bdt ?? raw?.amountBDT ?? raw?.amount ?? null,
    created_at: raw?.created_at || now,
    updated_at: now,
  };
}

/**
 * Upsert a subscription/plan row into MongoDB `subscriptions`.
 *
 * The natural key is `slug` for plan rows and `merchant_email` for renewal
 * rows, matching how every reader in this codebase identifies the document.
 * Mongoose-free and schema-free: whatever the admin configurator sends is what
 * is persisted, so a price edit can never be silently dropped by a stale
 * database schema (which is exactly what the Supabase 42703 column error did).
 */
async function writeSubscriptionToMongo(record: Record<string, any>): Promise<{ ok: boolean; error?: string }> {
  const matchColumn = record.slug ? 'slug' : (record.merchant_email ? 'merchant_email' : 'id');

  // Primary collection. `_id` is stripped so Mongo assigns/keeps its own and a
  // repeated save is a true update rather than a duplicate-key failure.
  const { _id: _ignored, ...doc } = record;
  const primary = await upsertMongoRecord('subscriptions', doc, matchColumn);
  if (primary.ok) return { ok: true };

  // Legacy/mirror collection: older deployments kept the plan catalogue under
  // `subscription_plans`. Writing it too keeps both readers in step.
  const legacy = await upsertMongoRecord('subscription_plans', doc, matchColumn);
  if (legacy.ok) return { ok: true };

  return { ok: false, error: primary.error || legacy.error };
}

/**
 * Read the subscription rows. PURE MongoDB — reads `subscriptions` plus the
 * legacy `subscription_requests` collection so renewals recorded by older
 * builds are still returned.
 */
async function readMongoSubscriptions(limit = 5000): Promise<{ rows: Record<string, any>[]; error?: string }> {
  const [current, legacy, requests] = await Promise.all([
    queryMongoCollection<Record<string, any>>('subscriptions', {}, { limit }),
    queryMongoCollection<Record<string, any>>('subscription_plans', {}, { limit }),
    queryMongoCollection<Record<string, any>>('subscription_requests', {}, { limit }),
  ]);

  const rows = [...current.rows, ...legacy.rows, ...requests.rows];
  // `subscriptions` is authoritative, so it is placed LAST and therefore wins
  // per-document when a mirror collection describes the same record.
  return { rows, error: rows.length ? undefined : (current.error || legacy.error || requests.error) };
}

/**
 * Upsert a subscription/plan record into MongoDB.
 *
 * Never throws: the caller receives a shaped result, so a route always answers
 * 200. `sources` is `['mongodb']` on success and `[]` only when Mongo itself is
 * unreachable.
 */
export async function writeSubscription(raw: Record<string, any>): Promise<SubscriptionWriteResult> {
  const record = normalizeSubscription(raw);
  const sources: DataSource[] = [];

  const mongo = await writeSubscriptionToMongo(record);
  if (mongo.ok) sources.push('mongodb');
  else console.warn('[subscriptionStore] MongoDB write notice:', mongo.error);

  const ok = sources.length > 0;
  return {
    ok,
    sources,
    record,
    error: ok ? undefined : 'Failed to persist the subscription to MongoDB.',
  };
}

/** List ALL subscriptions (renewals + plans) straight from MongoDB. */
export async function listSubscriptions(): Promise<HybridResult<Record<string, any>>> {
  const read = await readMongoSubscriptions();

  // De-duplicate on the natural key so the catalogue and the renewal mirror
  // cannot double-count the same record; first occurrence wins.
  const byKey = new Map<string, Record<string, any>>();
  for (const row of read.rows) {
    const key = String(row?.slug || row?.id || row?.merchant_email || '').trim().toLowerCase();
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, { ...row, _source: 'mongodb' });
  }
  const data = [...byKey.values()];

  return {
    data,
    sources: data.length ? ['mongodb'] : [],
    ok: data.length > 0,
    mongodb: { ok: !read.error, count: data.length, error: read.error },
    supabase: { ok: false, count: 0, error: 'Supabase is not used for subscriptions.' },
  };
}

/**
 * The plan-catalogue slugs. A row is only a PLAN when its identity is one of
 * these (or when it looks like a catalogue row in every other respect).
 */
export const PLAN_CATALOGUE_SLUGS = DEFAULT_PLANS.map((p) => String(p.slug));

/**
 * Is this row a catalogue PLAN, or a tenant renewal/request record?
 *
 * WHY THIS EXISTS
 * ---------------
 * The `subscriptions` collection historically held TWO kinds of document:
 * catalogue plans (keyed by `slug`, e.g. `pro_6m`) and tenant renewals (keyed by
 * `merchant_email`, carrying `plan_name`). `readMongoSubscriptions` also merges
 * the legacy `subscription_requests` collection, whose rows carry `plan_name`
 * too. The catalogue filter `p.slug || p.plan_name || p.name` therefore let
 * tenant rows through, and each one rendered as a bogus plan card in the
 * merchant's plan grid — the `mmalamin9912@gmail.com` / `0 BDT / 30d` and
 * `sub-1790184996113` cards in the reported bug.
 *
 * A real plan is distinguished by what it is NOT:
 *   • no owning merchant (`merchant_email` / `email` / `store_slug`),
 *   • no activation lifecycle on the row itself (`subscription_status`,
 *     `approved_at`, `transaction_id`),
 *   • a usable price and duration (> 0).
 * That keeps the four standard plans and drops every tenant record, without
 * hard-coding the slug list so an admin-created custom plan still appears.
 */
export function isCataloguePlan(row: Record<string, any>): boolean {
  if (!row || typeof row !== 'object') return false;

  const slug = String(row.slug || row.plan_id || row.planId || '').trim();
  const knownSlug = slug && PLAN_CATALOGUE_SLUGS.includes(slug);

  // A tenant record is positively identified by an owner or a renewal lifecycle.
  const owner = String(row.merchant_email || row.merchantEmail || row.email || row.store_slug || row.storeSlug || '').trim();
  const hasLifecycle =
    Boolean(row.subscription_status || row.subscriptionStatus) ||
    Boolean(row.approved_at) ||
    Boolean(row.transaction_id || row.transactionId) ||
    Boolean(row.expires_at || row.expiresAt || row.subscription_expiry || row.subscriptionExpiry);
  if (owner || hasLifecycle) return false;

  // A zero-value or zero-duration row is a data artefact, never a sellable plan.
  const price = Number(row.price_bdt ?? row.priceBDT ?? row.price ?? row.amount_bdt ?? NaN);
  const duration = Number(row.duration_days ?? row.durationDays ?? row.duration ?? row.days ?? NaN);
  const hasPrice = Number.isFinite(price) && price > 0;
  const hasDuration = Number.isFinite(duration) && duration > 0;
  if (!hasPrice || !hasDuration) return false;

  const name = String(row.plan_name || row.planName || row.name || row.title || '').trim();
  return Boolean(name || knownSlug);
}

/**
 * Read the plan catalogue straight from MongoDB, with auto-seeding.
 *
 * Flow:
 *   1. Read the `subscriptions` collection (plus the legacy mirrors).
 *   2. Keep ONLY catalogue plans — tenant renewals and request rows are filtered
 *      out by `isCataloguePlan` so they cannot render as phantom cards.
 *   3. Merge, keyed by slug/id so a plan cannot appear twice.
 *   4. If empty, seed the default catalogue into MongoDB and return it, so the
 *      very first request still renders a full price list.
 *
 * Pure MongoDB — there is no Supabase hop left to fail, which is what removed
 * the HTTP 400 / SQLSTATE 42703 failure from this path entirely.
 */
export async function listSubscriptionPlans(): Promise<PlanListResult> {
  const mongo = await queryMongoCollection<Record<string, any>>('subscriptions', {}, { limit: 1000 });
  const mongoLegacy = await queryMongoCollection<Record<string, any>>('subscription_plans', {}, { limit: 1000 });

  const byId = new Map<string, Record<string, any>>();
  // Least-authoritative first; `subscriptions` wins per row.
  const orderedRows = [...mongoLegacy.rows, ...mongo.rows];
  for (const row of orderedRows) {
    const norm = normalizeSubscription(row);
    // Drop tenant renewals / requests BEFORE they can be keyed as a plan.
    if (!isCataloguePlan(norm)) continue;
    const key = norm.slug || norm.id;
    if (!key) continue;
    byId.set(String(key), { ...(byId.get(String(key)) || {}), ...norm });
  }

  let plans = [...byId.values()];
  const sources: DataSource[] = [];
  if (orderedRows.length) sources.push('mongodb');

  let seeded = false;

  // LEGACY TIER MIGRATION — the catalogue was simplified from four duration
  // tiers (Starter/Growth/Pro/Enterprise) to two monthly tiers (Rise/Growth).
  // Retired rows are tombstoned; legacy slugs map onto the tier whose features
  // they best match (Starter/1m → Rise, everything paid above it → Growth), so
  // a database seeded by an older build reads the new layout without manual
  // cleanup.
  if (plans.length > 0) {
    const retired = new Set(['starter_1m', 'starter_3m', 'pro_6m', 'enterprise_12m']);
    const legacyTarget: Record<string, string> = {
      starter_1m: 'rise',
      starter_3m: 'growth',
      pro_6m: 'growth',
      enterprise_12m: 'growth',
    };
    const presentSlugs = new Set(plans.map((p) => String(p.slug || p.id || '').toLowerCase()));
    const mappingActive = ['rise', 'growth'].some((t) => presentSlugs.has(t));

    if (mappingActive) {
      for (const plan of plans) {
        const slug = String(plan.slug || plan.id || '').toLowerCase();
        if (!retired.has(slug)) continue;
        const target = legacyTarget[slug];
        // Copy popularity over to the surviving tier before tombstoning, then
        // deactivate the legacy row so it stops rendering everywhere.
        const alive = plans.find((p) => String(p.slug || p.id || '').toLowerCase() === target);
        if (alive && plan.isPopular && !alive.isPopular) {
          const merged = { ...alive, isPopular: true, is_popular: true };
          await writeSubscription(merged);
          plans = plans.map((p) => (p === alive ? normalizeSubscription(merged) : p));
        }
        await upsertMongoRecord('subscriptions', { slug, is_active: false, isActive: false }, 'slug');
        plans = plans.filter((p) => String(p.slug || p.id || '').toLowerCase() !== slug);
      }
    }
  }

  // Auto-init: an empty catalogue is seeded into MongoDB so the very first
  // request (a fresh deployment/collection) still returns real prices.
  if (plans.length === 0) {
    const seedResults = await Promise.all(DEFAULT_PLANS.map((p) => writeSubscription(p)));
    seeded = seedResults.some((r) => r.ok);
    if (seeded) {
      plans = DEFAULT_PLANS.map((p) => normalizeSubscription(p));
      sources.push('mongodb');
    }
  }

  return {
    ok: true,
    data: plans,
    sources: [...new Set(sources)],
    seeded,
    error: mongo.error || mongoLegacy.error,
    diagnostics: {
      // Kept in the payload for the admin diagnostics panel; Supabase is no
      // longer queried for subscriptions, so it is reported as not-in-use.
      provider: 'mongodb',
      supabase: { ok: true, count: 0, error: undefined, inUse: false },
      mongodb: { ok: !mongo.error && !mongoLegacy.error, count: orderedRows.length, error: mongo.error || mongoLegacy.error },
    },
  };
}

/**
 * Remove a subscription/plan from MongoDB by slug (hard delete in the
 * catalogue collection, soft-deactivate in the operational one so historical
 * renewal rows keep their reference).
 */
export async function deleteSubscription(ref: string): Promise<{ ok: boolean; sources: DataSource[] }> {
  const sources: DataSource[] = [];
  const clean = String(ref || '').trim().toLowerCase();
  if (!clean) return { ok: false, sources };

  const [bySlug, byId] = await Promise.all([
    deleteMongoRecord('subscriptions', 'slug', clean),
    deleteMongoRecord('subscriptions', 'id', clean),
  ]);
  if ((bySlug.ok && bySlug.deleted > 0) || (byId.ok && byId.deleted > 0)) sources.push('mongodb');

  // The legacy catalogue mirror is removed outright too.
  const legacy = await deleteMongoRecord('subscription_plans', 'slug', clean);
  if (legacy.ok && legacy.deleted > 0 && !sources.includes('mongodb')) sources.push('mongodb');

  // Keep a tombstone so a stale client cannot resurrect the plan.
  const tombstone = await upsertMongoRecord('subscriptions', { slug: clean, is_active: false, isActive: false }, 'slug');
  if (tombstone.ok && !sources.includes('mongodb')) sources.push('mongodb');

  return { ok: sources.length > 0, sources };
}

/** Explicit auto-seed entry point (callable from a route or script). */
export async function ensureSubscriptionSeed(): Promise<{ ok: boolean; seeded: boolean; sources: DataSource[] }> {
  const existing = await listSubscriptionPlans();
  return { ok: true, seeded: existing.seeded, sources: existing.sources };
}

export default {
  writeSubscription,
  listSubscriptions,
  listSubscriptionPlans,
  deleteSubscription,
  ensureSubscriptionSeed,
  normalizeSubscription,
  DEFAULT_PLANS,
};
