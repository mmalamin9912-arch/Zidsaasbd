/**
 * Merchant authentication with Supabase-first, MongoDB-fallback.
 *
 * STRATEGY
 * --------
 * On login/registration the email is checked against Supabase's `stores` table
 * FIRST (the canonical auth mirror). If Supabase returns a matching store,
 * that record is authoritative and is returned immediately so multi-device
 * sessions stay in sync — a merchant signing in on a new device on a different
 * machine instantly sees the same store/email binding.
 *
 * Only when Supabase is unconfigured, times out, or returns no rows does the
 * lookup fall through to MongoDB. This guarantees:
 *   - Strict one-store-per-email enforcement: if a store with this email
 *     already exists in EITHER provider, the existing record is returned
 *     (never a duplicate).
 *   - Zero service disruption: if Supabase is unreachable, Mongo answers and
 *     the merchant can still log in.
 *
 * Import-safe from the Express bootstrap (server.ts) and Vercel functions.
 */

import mongoose from 'mongoose';
import { getMongoUri, describeMongoError, DB_NAME } from './db.js';
import { getSupabaseServerConfig, querySupabaseTable } from './hybridDb.js';
import type { DataSource } from './hybridDb.js';

export interface AuthMerchantRecord {
  id: string;
  storeId: string;
  storeCode: string;
  storeName: string;
  storeSlug: string;
  ownerName: string;
  email: string;
  phone: string;
  subscriptionPlan: string;
  subscriptionExpiry: string | null;
  plan_started_at: string | null;
  expires_at: string | null;
  duration_days: number;
  trialDaysRemaining: number;
  trialEndsAt: string | null;
  isLocked: boolean;
  status: string;
  createdAt: string | null;
  /** Which provider(s) confirmed this email. */
  sources: DataSource[];
  /** true when the record was found (not a brand-new registration). */
  isExisting: boolean;
}

/**
 * Check Supabase `stores` table for a merchant by email. Never throws.
 * Returns the normalised record + 'supabase' source when found, or null.
 */
async function lookupSupabaseByEmail(email: string): Promise<{ record: AuthMerchantRecord | null; error?: string }> {
  const { supabaseUrl, supabaseKey, isConfigured } = getSupabaseServerConfig();
  if (!isConfigured) return { record: null, error: 'Supabase is not configured.' };

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/stores?email=eq.${encodeURIComponent(email)}&select=*&limit=1`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
      }
    );

    if (!res.ok) {
      return { record: null, error: `Supabase stores responded ${res.status}` };
    }
    const text = await res.text();
    if (!text || text.trimStart().startsWith('<')) return { record: null };
    const rows = JSON.parse(text);
    if (!Array.isArray(rows) || rows.length === 0) return { record: null };

    const row = rows[0];
    const record = normalizeSupabaseRecord(row);
    return { record };
  } catch (err: any) {
    return { record: null, error: err?.message || 'Supabase lookup failed' };
  }
}

/**
 * Check MongoDB `stores` then `merchants` collections for a merchant by email.
 * Never throws — returns null + error description when Mongo is unavailable.
 */
async function lookupMongoByEmail(email: string): Promise<{ record: AuthMerchantRecord | null; error?: string }> {
  if (!getMongoUri()) {
    return { record: null, error: describeMongoError(new Error('MONGODB_URI is not set')).message };
  }

  try {
    const mongoose = await import('./db.js').then(m => m.connectToDatabase(DB_NAME));
    const db = mongoose.connection.db;
    if (!db) return { record: null, error: 'MongoDB connection handle unavailable.' };

    const emailRegex = new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

    for (const collectionName of ['stores', 'merchants']) {
      try {
        const doc = await db.collection(collectionName).findOne({ email: emailRegex });
        if (doc) {
          const record = normalizeMongoRecord(doc);
          return { record };
        }
      } catch (err: any) {
        if (!/ns not found|does not exist/i.test(String(err?.message || ''))) {
          console.warn(`[authService] Mongo ${collectionName} lookup warning:`, err?.message || err);
        }
      }
    }
    return { record: null };
  } catch (err: any) {
    const desc = describeMongoError(err);
    return { record: null, error: desc.message };
  }
}

/**
 * Upsert a merchant record into MongoDB (used when Supabase was the source but
 * we want to keep Mongo in sync). Never throws.
 */
async function upsertMongoRecord(
  email: string,
  record: Record<string, any>
): Promise<{ ok: boolean; error?: string }> {
  if (!getMongoUri()) return { ok: false, error: 'MongoDB is not configured.' };

  try {
    const { connectToDatabase } = await import('./db.js');
    const mongoose = await connectToDatabase(DB_NAME);
    const db = mongoose.connection.db;
    if (!db) return { ok: false, error: 'MongoDB connection handle unavailable.' };

    const emailRegex = new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const existing = await db.collection('stores').findOne({ email: emailRegex });

    const now = new Date().toISOString();
    if (existing) {
      await db.collection('stores').updateOne(
        { email: emailRegex },
        { $set: { ...record, updated_at: now, updatedAt: now } }
      );
    } else {
      await db.collection('stores').insertOne({ ...record, created_at: now, createdAt: now });
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'MongoDB upsert failed' };
  }
}

/**
 * Upsert a merchant record into Supabase (used when Mongo was the source but
 * we want to keep Supabase in sync). Never throws.
 */
async function upsertSupabaseRecord(
  email: string,
  record: Record<string, any>
): Promise<{ ok: boolean; error?: string; statusCode?: number }> {
  const { supabaseUrl, supabaseKey, isConfigured } = getSupabaseServerConfig();
  if (!isConfigured) return { ok: false, error: 'Supabase is not configured.' };

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/stores`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({ ...record, email }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
    });

    if (res.ok) return { ok: true, statusCode: res.status };
    return { ok: false, error: `Supabase upsert responded ${res.status}`, statusCode: res.status };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Supabase upsert failed' };
  }
}

/* ────────────────────────── normalisation ────────────────────────── */

/** Plan duration lookup, shared by both normalisers. */
function getPlanDurationInDays(planId?: string): number {
  if (!planId) return 30;
  const lower = String(planId).toLowerCase().trim();
  if (lower.includes('12m') || lower.includes('enterprise') || lower.includes('year') || lower === '12') return 365;
  if (lower.includes('6m') || lower.includes('pro') || lower.includes('half_year') || lower === '6') return 180;
  if (lower.includes('3m') || lower.includes('starter_3m') || lower === '3') return 90;
  if (lower.includes('1m') || lower.includes('starter_1m') || lower.includes('free_trial') || lower.includes('trial') || lower.includes('month') || lower === '1') return 30;
  if (lower.includes('starter')) return 90;
  return 30;
}

/** Normalise a Supabase `stores` row into AuthMerchantRecord. */
function normalizeSupabaseRecord(row: Record<string, any>): AuthMerchantRecord {
  const plan = String(row?.subscription_plan || row?.subscriptionPlan || 'free_trial').toLowerCase();
  const durationDays = getPlanDurationInDays(plan);
  const planStartedAt = row?.plan_started_at || row?.planStartedAt || new Date().toISOString();
  const isPaid = plan !== 'free_trial' && plan !== 'trial';
  const expiresAt = row?.expires_at || row?.expiresAt || (isPaid ? new Date(Date.now() + durationDays * 86400000).toISOString() : null);

  return {
    id: String(row?.id || row?._id || ''),
    storeId: String(row?.store_id || row?.storeId || row?.id || ''),
    storeCode: String(row?.store_code || row?.storeCode || ''),
    storeName: String(row?.store_name || row?.storeName || ''),
    storeSlug: String(row?.store_slug || row?.storeSlug || ''),
    ownerName: String(row?.owner_name || row?.ownerName || ''),
    email: String(row?.email || '').toLowerCase(),
    phone: String(row?.phone || ''),
    subscriptionPlan: plan,
    subscriptionExpiry: isPaid ? (row?.subscription_expiry || row?.subscriptionExpiry || (expiresAt ? expiresAt.split('T')[0] : null)) : null,
    plan_started_at: planStartedAt || null,
    expires_at: expiresAt || null,
    duration_days: durationDays,
    trialDaysRemaining: isPaid ? 0 : (row?.trial_days_remaining ?? row?.trialDaysRemaining ?? 30),
    trialEndsAt: !isPaid ? (row?.trial_ends_at || row?.trialEndsAt || expiresAt || null) : null,
    isLocked: Boolean(row?.is_locked || row?.isLocked),
    status: String(row?.status || 'active'),
    createdAt: row?.created_at ? new Date(row.created_at).toISOString() : null,
    sources: ['supabase'],
    isExisting: true,
  };
}

/** Normalise a MongoDB stores/merchants document into AuthMerchantRecord. */
function normalizeMongoRecord(row: Record<string, any>): AuthMerchantRecord {
  return normalizeSupabaseRecord(row);
}

/* ────────────────────────── public API ────────────────────────── */

/**
 * Authenticate / register a merchant by email.
 *
 * Flow:
 *   1. Check Supabase `stores` table by email. If found → return that record
 *      (authoritative, keeps multi-device sessions in sync).
 *   2. If Supabase has no row (or is unreachable), check MongoDB `stores` +
 *      `merchants`.
 *   3. If neither source has the email → it's a new registration: write to
 *      SUPABASE FIRST, then mirror to MongoDB. One-store-per-email is
 *      enforced because step 1 & 2 will always return the existing record
 *      before a new insert ever runs.
 *
 * @param input.email   Lowercase email (validated by caller).
 * @param input.storeName / storeSlug / storeId / password / plan — used for
 *                   new registrations only.
 * @returns AuthMerchantRecord with `isExisting` flag and `sources` list.
 */
export async function authenticateMerchant(input: {
  email: string;
  storeName?: string;
  storeSlug?: string;
  storeId?: string;
  storeCode?: string;
  ownerName?: string;
  phone?: string;
  password?: string;
  subscriptionPlan?: string;
  logoUrl?: string;
}): Promise<AuthMerchantRecord | null> {
  const email = String(input.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return null;

  // ── 1. Supabase first ──
  const supaResult = await lookupSupabaseByEmail(email);
  if (supaResult.record) {
    // Keep MongoDB in sync with the Supabase truth (best-effort).
    void upsertMongoRecord(email, supaResult.record);
    return { ...supaResult.record, sources: ['supabase'], isExisting: true };
  }
  if (supaResult.error) {
    console.warn('[authService] Supabase lookup warning:', supaResult.error);
  }

  // ── 2. MongoDB fallback ──
  const mongoResult = await lookupMongoByEmail(email);
  if (mongoResult.record) {
    // Keep Supabase in sync with the Mongo truth (best-effort).
    void upsertSupabaseRecord(email, mongoResult.record);
    return { ...mongoResult.record, sources: ['mongodb'], isExisting: true };
  }
  if (mongoResult.error) {
    console.warn('[authService] MongoDB lookup warning:', mongoResult.error);
  }

  // ── 3. New registration: write to BOTH providers ──
  const plan = String(input.subscriptionPlan || 'free_trial').toLowerCase();
  const durationDays = getPlanDurationInDays(plan);
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = now.getTime() + durationDays * 86400000;
  const expiresAtIso = new Date(expiresAt).toISOString();

  const storeSlug = input.storeSlug || input.storeName
    ? String(input.storeSlug || input.storeName || email.split('@')[0]).toLowerCase().replace(/[^a-z0-9]/g, '')
    : email.split('@')[0];
  const storeCode = input.storeCode || `ZID-BD-${String(Math.floor(1000 + Math.random() * 9000))}`;
  const storeId = input.storeId || `store-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const newRecord: Record<string, any> = {
    id: storeId,
    store_id: storeId,
    storeId,
    store_code: storeCode,
    storeCode,
    store_name: input.storeName || `${storeSlug} Store`,
    storeName: input.storeName || `${storeSlug} Store`,
    store_slug: storeSlug,
    storeSlug,
    owner_name: input.ownerName || email.split('@')[0],
    ownerName: input.ownerName || email.split('@')[0],
    email,
    phone: input.phone || '',
    password: input.password || '',
    subscription_plan: plan,
    subscriptionPlan: plan,
    plan_started_at: nowIso,
    planStartedAt: nowIso,
    expires_at: expiresAtIso,
    expiresAt: expiresAtIso,
    subscription_expiry: isPaidPlan(plan) ? expiresAtIso.split('T')[0] : null,
    subscriptionExpiry: isPaidPlan(plan) ? expiresAtIso.split('T')[0] : null,
    duration_days: durationDays,
    durationDays,
    trialEndsAt: !isPaidPlan(plan) ? expiresAtIso : null,
    trial_ends_at: !isPaidPlan(plan) ? expiresAtIso : null,
    trial_days_remaining: !isPaidPlan(plan) ? durationDays : 0,
    trialDaysRemaining: !isPaidPlan(plan) ? durationDays : 0,
    logo_url: input.logoUrl || '',
    logoUrl: input.logoUrl || '',
    is_locked: false,
    isLocked: false,
    status: 'active',
    created_at: nowIso,
    createdAt: nowIso,
    updated_at: nowIso,
    updatedAt: nowIso,
  };

  const sources: DataSource[] = [];

  // Write to Supabase FIRST (per the spec).
  const sbUpsert = await upsertSupabaseRecord(email, newRecord);
  if (sbUpsert.ok) sources.push('supabase');
  else console.warn('[authService] Supabase registration write error:', sbUpsert.error);

  // Mirror to MongoDB.
  const mongoUpsert = await upsertMongoRecord(email, newRecord);
  if (mongoUpsert.ok) sources.push('mongodb');
  else console.warn('[authService] MongoDB registration fallback write error:', mongoUpsert.error);

  if (sources.length === 0) return null;

  return {
    ...normalizeSupabaseRecord(newRecord),
    sources,
    isExisting: false,
  };
}

/**
 * Enforce the one-store-per-email policy: given an email, return true if a
 * store already exists for it in either Supabase or MongoDB.
 */
export async function emailHasStore(email: string): Promise<{ hasStore: boolean; sources: DataSource[] }> {
  const cleanEmail = email.trim().toLowerCase();
  const sources: DataSource[] = [];

  const supa = await lookupSupabaseByEmail(cleanEmail);
  if (supa.record) sources.push('supabase');

  const mongo = await lookupMongoByEmail(cleanEmail);
  if (mongo.record) sources.push('mongodb');

  return { hasStore: sources.length > 0, sources };
}

function isPaidPlan(plan: string): boolean {
  const key = String(plan || '').toLowerCase().trim();
  if (['free_trial', 'trial', 'free', 'basic', 'starter', ''].includes(key)) return false;
  return key.includes('pro') || key.includes('enterprise') || key.includes('business') || key.includes('premium') || key.includes('growth') || /(?:^|_)(1m|3m|6m|12m)$/.test(key) || /(?:^|_)(1|3|6|12)$/.test(key);
}

export default {
  authenticateMerchant,
  emailHasStore,
};
