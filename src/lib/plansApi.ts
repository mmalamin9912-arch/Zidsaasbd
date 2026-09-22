/**
 * Client-side API helpers for the subscription-plan catalogue.
 *
 * The plan catalogue is the SINGLE source of truth for both the Super Admin
 * "Subscription Plans Configurator" and the merchant "Subscription Plans"
 * selection modal. It is served by the dual-database endpoint
 * `/api/subscriptions` (Supabase-first with an automatic MongoDB fallback and
 * auto-seeding — see lib/subscriptionStore.ts), so a price/feature change made
 * by the admin is reflected on the merchant dashboard in real time.
 *
 * Every function is defensive: a network/parse failure resolves to a
 * null/empty result rather than throwing, so a render never breaks.
 */

import type { SubscriptionPlan } from '../types';

/** Raw plan row as returned by the API (DB-normalised shape). */
export interface ApiPlanRow {
  id: string;
  name: string;
  priceBDT: number;
  durationDays: number;
  isActive: boolean;
  maxProducts?: number;
  features?: string[];
  badge?: string;
  isPopular?: boolean;
  subscriberCount?: number;
  source?: string;
}

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    const text = await res.text();
    if (!text || text.trimStart().startsWith('<')) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Map a raw API plan row into the client `SubscriptionPlan` shape. */
export function mapApiPlanToSubscriptionPlan(row: ApiPlanRow): SubscriptionPlan {
  return {
    id: String(row.id || '').toLowerCase(),
    name: String(row.name || 'Plan'),
    price: Number(row.priceBDT || 0),
    durationDays: Number(row.durationDays || 0),
    badge: String(row.badge || row.id || '').toUpperCase(),
    features: Array.isArray(row.features) ? row.features : [],
    isActive: row.isActive !== false,
    isPopular: Boolean(row.isPopular),
  };
}

/**
 * Load the live plan catalogue from MongoDB-backed `/api/subscriptions`.
 *
 * Subscriptions are served by MongoDB only (see lib/subscriptionStore.ts), so
 * this call cannot fail with the Supabase SQLSTATE / missing-column 400 that
 * used to break the merchant modal. `/api/subscription-plans` is kept as a
 * secondary source for older deployments.
 */
export async function fetchPlans(): Promise<SubscriptionPlan[]> {
  const map = (rows: ApiPlanRow[] | undefined) =>
    (Array.isArray(rows) ? rows : []).map(mapApiPlanToSubscriptionPlan).filter(p => p.id);

  // 1. Dual-database endpoint (Supabase → MongoDB fallback + auto-seed).
  try {
    const res = await fetch('/api/subscriptions?type=plans', { headers: { Accept: 'application/json' } });
    const data = await safeJson<{ ok: boolean; plans: ApiPlanRow[] }>(res);
    const plans = map(data?.plans);
    if (plans.length > 0) return plans;
  } catch (err) {
    console.warn('[plansApi] fetchPlans (/api/subscriptions) failed:', err);
  }

  // 2. Legacy catalogue endpoint as a secondary source.
  try {
    const res = await fetch('/api/subscription-plans', { headers: { Accept: 'application/json' } });
    const data = await safeJson<{ ok: boolean; plans: ApiPlanRow[] }>(res);
    return map(data?.plans);
  } catch (err) {
    console.warn('[plansApi] fetchPlans (/api/subscription-plans) failed:', err);
    return [];
  }
}

/**
 * Ask the backend to auto-create the default plan catalogue when the store is
 * empty. Idempotent — an already-populated store is left untouched.
 */
export async function ensurePlansSeeded(): Promise<ApiPlanRow[]> {
  try {
    const res = await fetch('/api/subscription/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await safeJson<{ ok: boolean; plans: ApiPlanRow[] }>(res);
    return Array.isArray(data?.plans) ? data.plans : [];
  } catch (err) {
    console.warn('[plansApi] ensurePlansSeeded failed:', err);
    return [];
  }
}

/** Persist a single plan (create or update) to Supabase + MongoDB. */
export async function savePlan(plan: SubscriptionPlan): Promise<boolean> {
  try {
    const payload = {
      slug: plan.id,
      id: plan.id,
      plan_id: plan.id,
      plan_name: plan.name,
      name: plan.name,
      price_bdt: plan.price,
      priceBDT: plan.price,
      price: plan.price,
      duration_days: plan.durationDays,
      durationDays: plan.durationDays,
      badge_text: plan.badge,
      badge: plan.badge,
      features: plan.features,
      is_active: plan.isActive !== false,
      isActive: plan.isActive !== false,
      is_popular: Boolean(plan.isPopular),
      isPopular: Boolean(plan.isPopular),
    };
    // Save through the MongoDB-backed catalogue endpoint so the admin price
    // edit is durable the moment the configurator reports success (no refresh
    // can revert it).
    const res = await fetch('/api/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await safeJson<{ ok: boolean }>(res);
    if (data?.ok) return true;

    // Secondary: the admin catalogue endpoint (same MongoDB store).
    const adminRes = await fetch('/api/admin/subscription-plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const adminData = await safeJson<{ ok: boolean }>(adminRes);
    return Boolean(adminData?.ok);
  } catch (err) {
    console.warn('[plansApi] savePlan failed:', err);
    return false;
  }
}

/** Delete a plan from Supabase + MongoDB. */
export async function deletePlan(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/admin/subscription-plans/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await safeJson<{ ok: boolean }>(res);
    return Boolean(data?.ok);
  } catch (err) {
    console.warn('[plansApi] deletePlan failed:', err);
    return false;
  }
}

export default { fetchPlans, ensurePlansSeeded, savePlan, deletePlan, mapApiPlanToSubscriptionPlan };
