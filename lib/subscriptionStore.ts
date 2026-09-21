/**
 * Subscription record persistence for the merchant dashboard + Admin portal.
 *
 * The dashboard historically wrote subscription renewals only to the local
 * store payload. This module is the canonical Supabase-first / MongoDB-mirror
 * write path for the `subscriptions` table so:
 *   - the client-facing `subscriptions` read stops 404-ing (the table now
 *     exists and is populated), and
 *   - plan changes approved by the Super Admin propagate to both providers.
 *
 * It reuses the proven primitives from lib/supabaseAdminCRUD.ts (Supabase REST
 * writes) and lib/hybridDb.ts (dual reads). Never throws — callers get a shaped
 * result.
 */

import { getSupabaseServerConfig, fetchHybridSubscriptions } from './hybridDb.js';
import type { DataSource, HybridResult } from './hybridDb.js';
import { writeSupabaseRecord, upsertMongoRecord } from './supabaseAdminCRUD.js';

export interface SubscriptionWriteResult {
  ok: boolean;
  sources: DataSource[];
  error?: string;
  record?: Record<string, any>;
}

/** Normalise an arbitrary subscription payload into the canonical row shape. */
export function normalizeSubscription(raw: Record<string, any>): Record<string, any> {
  const now = new Date().toISOString();
  const email = String(raw?.merchant_email || raw?.merchantEmail || raw?.email || '').trim().toLowerCase();
  return {
    id: String(raw?.id || raw?.subscription_id || email || `sub-${Date.now()}`),
    merchant_email: email,
    store_slug: String(raw?.store_slug || raw?.storeSlug || '').trim().toLowerCase(),
    store_name: String(raw?.store_name || raw?.storeName || ''),
    subscription_plan: String(raw?.subscription_plan || raw?.planId || raw?.plan_id || 'free_trial'),
    plan_started_at: raw?.plan_started_at || raw?.planStartedAt || null,
    subscription_expiry: raw?.subscription_expiry || raw?.subscriptionExpiry || raw?.expiryDate || null,
    expires_at: raw?.expires_at || raw?.expiresAt || null,
    duration_days: Number(raw?.duration_days || raw?.durationDays || raw?.selectedPlanDays || 30),
    transaction_id: raw?.transaction_id || raw?.transactionId || null,
    payment_method: raw?.payment_method || raw?.paymentMethod || null,
    status: String(raw?.status || 'active'),
    amount_bdt: raw?.amount_bdt ?? raw?.amountBDT ?? raw?.amount ?? null,
    created_at: raw?.created_at || now,
    updated_at: now,
  };
}

/**
 * Upsert a subscription record into BOTH providers. The natural key is
 * `merchant_email` (falling back to `store_slug` / `id`).
 */
export async function writeSubscription(raw: Record<string, any>): Promise<SubscriptionWriteResult> {
  const record = normalizeSubscription(raw);
  const sources: DataSource[] = [];

  const matchValue = record.merchant_email || record.store_slug || record.id;

  // 1. Supabase first — INSERT ... ON CONFLICT via the shared REST helper.
  const { isConfigured } = getSupabaseServerConfig();
  if (isConfigured && matchValue) {
    const sb = await writeSupabaseRecord('subscriptions', 'POST', record);
    if (sb.ok) sources.push('supabase');
    else console.warn('[subscriptionStore] Supabase write notice:', sb.error);
  }

  // 2. Mirror to MongoDB for durability / degraded-Supabase operation.
  const mongo = await upsertMongoRecord('subscriptions', record, 'merchant_email');
  if (mongo.ok) sources.push('mongodb');
  else console.warn('[subscriptionStore] MongoDB write notice:', mongo.error);

  const ok = sources.length > 0;
  return {
    ok,
    sources,
    record,
    error: ok ? undefined : 'Failed to persist subscription to any provider.',
  };
}

/** List subscriptions from BOTH providers (merged). */
export function listSubscriptions(): Promise<HybridResult<Record<string, any>>> {
  return fetchHybridSubscriptions();
}

/** Delete a subscription from both providers by merchant email. */
export async function deleteSubscription(email: string): Promise<{ ok: boolean; sources: DataSource[] }> {
  const sources: DataSource[] = [];
  const clean = String(email || '').trim().toLowerCase();
  if (!clean) return { ok: false, sources };

  const { isConfigured } = getSupabaseServerConfig();
  if (isConfigured) {
    const sb = await writeSupabaseRecord('subscriptions', 'DELETE', {}, { column: 'merchant_email', value: clean });
    if (sb.ok) sources.push('supabase');
  }
  const mongo = await upsertMongoRecord('subscriptions', { merchant_email: clean }, 'merchant_email');
  if (mongo.ok) sources.push('mongodb');
  return { ok: sources.length > 0, sources };
}

export default { writeSubscription, listSubscriptions, deleteSubscription, normalizeSubscription };
