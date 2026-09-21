/**
 * Subscription persistence for the merchant dashboard + Admin portal.
 *
 * This module is the canonical Supabase-first / MongoDB-fallback store for the
 * `subscriptions` table. It exists to guarantee three behaviours:
 *
 *   1. GRACEFUL DEGRADATION — when Supabase returns PGRST205 ("table not found")
 *      or any 404, reads fall through to the MongoDB `subscriptions` collection
 *      and writes are still persisted to MongoDB, so the API never 404s.
 *   2. DUAL WRITE — a successful admin save writes to BOTH providers (Supabase
 *      canonical, MongoDB mirror) so neither outage loses data.
 *   3. AUTO-SEED — if BOTH providers are empty, the default plan catalogue
 *      (1-Month, Starter, Pro, Enterprise) is created automatically.
 *
 * Reuses the proven primitives from lib/supabaseAdminCRUD.ts (Supabase REST
 * writes) and lib/hybridDb.ts (dual reads). Never throws — callers get a shaped
 * result so a route can always answer 200.
 */

import { getSupabaseServerConfig, querySupabaseTable, queryMongoCollection, fetchHybridSubscriptions } from './hybridDb.js';
import type { DataSource, HybridResult } from './hybridDb.js';
import { writeSupabaseRecord, upsertMongoRecord } from './supabaseAdminCRUD.js';

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

/** The default plan catalogue auto-seeded into an empty store. */
export const DEFAULT_PLANS: Record<string, any>[] = [
  {
    id: 'starter_1m', slug: 'starter_1m', plan_id: 'starter_1m',
    plan_name: '1-Month Plan', name: '1-Month Plan',
    price_bdt: 1000, priceBDT: 1000, price: 1000,
    duration_days: 30, durationDays: 30, badge_text: '1_MONTH', badge: '1_MONTH',
    features: ['Up to 100 Products', 'Standard Themes', 'Basic AI Tools', 'Standard Support'],
    is_active: true, isActive: true, is_popular: false, isPopular: false, max_products: 100,
  },
  {
    id: 'starter_3m', slug: 'starter_3m', plan_id: 'starter_3m',
    plan_name: 'Starter Plan (3 Months)', name: 'Starter Plan (3 Months)',
    price_bdt: 3000, priceBDT: 3000, price: 3000,
    duration_days: 90, durationDays: 90, badge_text: '3_MONTHS', badge: '3_MONTHS',
    features: ['Up to 500 Products', 'Standard Themes', 'Pro AI Tools (Description, Image, Pricing)', 'Standard Support'],
    is_active: true, isActive: true, is_popular: false, isPopular: false, max_products: 500,
  },
  {
    id: 'pro_6m', slug: 'pro_6m', plan_id: 'pro_6m',
    plan_name: 'Pro Plan (6 Months)', name: 'Pro Plan (6 Months)',
    price_bdt: 5000, priceBDT: 5000, price: 5000,
    duration_days: 180, durationDays: 180, badge_text: '6_MONTHS', badge: '6_MONTHS',
    features: ['Unlimited Products', 'Premium Themes', 'Pro AI Marketing & Caption Tools', 'Priority Support'],
    is_active: true, isActive: true, is_popular: true, isPopular: true, max_products: 0,
  },
  {
    id: 'enterprise_12m', slug: 'enterprise_12m', plan_id: 'enterprise_12m',
    plan_name: 'Enterprise Plan (12 Months)', name: 'Enterprise Plan (12 Months)',
    price_bdt: 15000, priceBDT: 15000, price: 15000,
    duration_days: 365, durationDays: 365, badge_text: '12_MONTHS', badge: '12_MONTHS',
    features: ['Unlimited Products', 'Full AI Suite Unlocked', 'Priority Support', 'Custom Domain'],
    is_active: true, isActive: true, is_popular: false, isPopular: false, max_products: 0,
  },
];

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
 * Upsert a subscription/plan record into BOTH providers.
 *
 * Supabase is attempted first; a PGRST205/404 (missing table) or any other
 * failure simply falls through to MongoDB so the write is never lost. The
 * natural key is `slug` for plan rows, else `merchant_email`.
 */
export async function writeSubscription(raw: Record<string, any>): Promise<SubscriptionWriteResult> {
  const record = normalizeSubscription(raw);
  const sources: DataSource[] = [];

  const matchColumn = record.slug ? 'slug' : 'merchant_email';
  const matchValue = record.slug || record.merchant_email || record.id;

  // 1. Supabase first — INSERT ... ON CONFLICT via the shared REST helper.
  const { isConfigured } = getSupabaseServerConfig();
  if (isConfigured && matchValue) {
    const sb = await writeSupabaseRecord('subscriptions', 'POST', record);
    if (sb.ok) sources.push('supabase');
    else console.warn('[subscriptionStore] Supabase write notice (falling back to MongoDB):', sb.error);
  }

  // 2. Mirror to MongoDB (fallback AND redundancy).
  const mongo = await upsertMongoRecord('subscriptions', record, matchColumn);
  if (mongo.ok) sources.push('mongodb');
  else console.warn('[subscriptionStore] MongoDB write notice:', mongo.error);

  const ok = sources.length > 0;
  return {
    ok,
    sources,
    record,
    error: ok ? undefined : 'Failed to persist subscription to both Supabase and MongoDB.',
  };
}

/** List ALL subscriptions (renewals + plans) from BOTH providers (merged). */
export function listSubscriptions(): Promise<HybridResult<Record<string, any>>> {
  return fetchHybridSubscriptions();
}

/**
 * Read the plan catalogue with automatic MongoDB fallback and auto-seeding.
 *
 * Flow:
 *   1. Read Supabase `subscriptions` (a PGRST205/404 degrades to [] — no throw).
 *   2. Read MongoDB `subscriptions` + `subscription_plans`.
 *   3. Merge, preferring Supabase per row.
 *   4. If BOTH are empty, seed the default catalogue into both providers and
 *      return the seeded plans (so the very first request still returns data).
 */
export async function listSubscriptionPlans(): Promise<PlanListResult> {
  const supa = await querySupabaseTable<Record<string, any>>('subscriptions', { limit: 1000 });
  const mongo = await queryMongoCollection<Record<string, any>>('subscriptions', {}, { limit: 1000 });
  const mongoLegacy = await queryMongoCollection<Record<string, any>>('subscription_plans', {}, { limit: 1000 });

  const byId = new Map<string, Record<string, any>>();
  // Least-authoritative first; most-authoritative wins per row.
  const orderedRows = [...mongoLegacy.rows, ...mongo.rows, ...supa.rows];
  for (const row of orderedRows) {
    const norm = normalizeSubscription(row);
    const key = norm.slug || norm.id;
    if (!key) continue;
    byId.set(String(key), { ...(byId.get(String(key)) || {}), ...norm });
  }

  let plans = [...byId.values()].filter((p) => p.slug || p.plan_name || p.name);
  const sources: DataSource[] = [];
  if (supa.rows.length) sources.push('supabase');
  if (mongo.rows.length || mongoLegacy.rows.length) sources.push('mongodb');

  let seeded = false;

  // Auto-init: both providers empty → seed the default catalogue.
  if (plans.length === 0) {
    const seedResults = await Promise.all(DEFAULT_PLANS.map((p) => writeSubscription(p)));
    seeded = seedResults.some((r) => r.ok);
    if (seeded) {
      plans = DEFAULT_PLANS.map((p) => normalizeSubscription(p));
      if (getSupabaseServerConfig().isConfigured) sources.push('supabase');
      sources.push('mongodb');
    }
  }

  return {
    ok: true,
    data: plans,
    sources: [...new Set(sources)],
    seeded,
    error: supa.error || mongo.error || mongoLegacy.error,
    diagnostics: {
      supabase: { ok: !supa.error, count: supa.rows.length, error: supa.error },
      mongodb: { ok: !mongo.error && !mongoLegacy.error, count: mongo.rows.length + mongoLegacy.rows.length, error: mongo.error || mongoLegacy.error },
    },
  };
}

/** Delete a subscription from both providers by slug or merchant email. */
export async function deleteSubscription(ref: string): Promise<{ ok: boolean; sources: DataSource[] }> {
  const sources: DataSource[] = [];
  const clean = String(ref || '').trim().toLowerCase();
  if (!clean) return { ok: false, sources };

  const { isConfigured } = getSupabaseServerConfig();
  if (isConfigured) {
    const sb = await writeSupabaseRecord('subscriptions', 'DELETE', {}, { column: 'slug', value: clean });
    if (sb.ok) sources.push('supabase');
  }
  const mongo = await upsertMongoRecord('subscriptions', { slug: clean, is_active: false, isActive: false }, 'slug');
  if (mongo.ok) sources.push('mongodb');
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
