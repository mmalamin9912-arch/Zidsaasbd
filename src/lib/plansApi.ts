/**
 * Client-side API helpers for the subscription-plan catalogue.
 *
 * The plan catalogue is the SINGLE source of truth for both the Super Admin
 * "Subscription Plans Configurator" and the merchant "Subscription Plans"
 * selection modal. It is persisted Supabase-first with a MongoDB fallback via
 * the `/api/admin/subscription-plans` routes (see lib/supabaseAdminCRUD.ts).
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

/** Load the live plan catalogue from Supabase + MongoDB. */
export async function fetchPlans(): Promise<SubscriptionPlan[]> {
  try {
    const res = await fetch('/api/subscription-plans', { headers: { Accept: 'application/json' } });
    const data = await safeJson<{ ok: boolean; plans: ApiPlanRow[] }>(res);
    if (!Array.isArray(data?.plans)) return [];
    return data.plans.map(mapApiPlanToSubscriptionPlan).filter(p => p.id);
  } catch (err) {
    console.warn('[plansApi] fetchPlans failed:', err);
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
      name: plan.name,
      priceBDT: plan.price,
      price: plan.price,
      durationDays: plan.durationDays,
      badge: plan.badge,
      features: plan.features,
      isActive: plan.isActive !== false,
      isPopular: Boolean(plan.isPopular),
    };
    const res = await fetch('/api/admin/subscription-plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await safeJson<{ ok: boolean }>(res);
    return Boolean(data?.ok);
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

export default { fetchPlans, savePlan, deletePlan, mapApiPlanToSubscriptionPlan };
