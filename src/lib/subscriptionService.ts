import { supabase } from './supabase';
import { MerchantProfile, SubscriptionPlanId } from '../types';
import {
  getPlanDurationInDays,
  calculatePlanTimestamps,
  calculateRemainingDays,
  isPaidSubscriptionActive,
  getPlanDisplayName
} from '../utils/subscriptionUtils';
import { initialMerchant } from '../data/initialData';
import { writeZidStoreData } from './storeData';
import { safeParseJson } from './safeFetch';

export interface SubscriptionSyncOptions {
  merchant: MerchantProfile;
  planId: string;
  startDate?: Date;
  transactionId?: string;
  paymentMethod?: string;
  status?: 'active' | 'pending';
}

/**
 * Universal Normalizer: Resolves any raw merchant/subscription record into a consistent
 * MerchantProfile with strictly validated plan durations and exact expiration timestamps:
 * - starter_1m / 1 Month -> 30 Days (NOW + 30 days)
 * - starter_3m / 3 Months -> 90 Days (NOW + 90 days)
 * - pro_6m / 6 Months -> 180 Days (NOW + 180 days)
 * - enterprise_12m / 12 Months -> 365 Days (NOW + 365 days)
 */
export function resolveMerchantSubscription(
  rawMerchant: any,
  rawSubRecord?: any
): MerchantProfile {
  if (!rawMerchant && !rawSubRecord) {
    return initialMerchant;
  }

  const merged = {
    ...(rawMerchant || {}),
    ...(rawSubRecord || {})
  };

  const planId: SubscriptionPlanId =
    merged.subscription_plan ||
    merged.subscriptionPlan ||
    merged.planId ||
    merged.plan_id ||
    'free_trial';

  const isPaid = planId !== 'free_trial' && planId !== 'trial';
  const durationDays = getPlanDurationInDays(planId);
  const durationMs = durationDays * 24 * 60 * 60 * 1000;

  // Resolve start timestamp
  const rawStartTime =
    merged.plan_started_at ||
    merged.planStartedAt ||
    merged.plan_start_date ||
    merged.subscriptionStartDate ||
    merged.created_at ||
    merged.registeredAt ||
    new Date().toISOString();

  const startMs = !isNaN(new Date(rawStartTime).getTime())
    ? new Date(rawStartTime).getTime()
    : Date.now();

  const plan_started_at = new Date(startMs).toISOString();

  // Resolve expiry timestamp
  const explicitExpiry =
    merged.expires_at ||
    merged.expiresAt ||
    merged.subscription_expiry ||
    merged.subscriptionExpiry ||
    merged.subscription_end_date;

  let expires_at: string;
  let explicitExpiryMs = explicitExpiry && !isNaN(new Date(explicitExpiry).getTime())
    ? new Date(explicitExpiry).getTime()
    : 0;

  // Sanity check: If merchant is on a paid multi-month plan (>=90d) but explicitExpiry is <40d away from start,
  // or expiry has already passed unexpectedly, dynamically recalculate true expires_at from plan start + duration
  const isMismatchedDuration =
    isPaid &&
    durationDays >= 90 &&
    (explicitExpiryMs === 0 || explicitExpiryMs - startMs < (durationDays - 10) * 86400000);

  if (explicitExpiryMs > 0 && !isMismatchedDuration) {
    expires_at = new Date(explicitExpiryMs).toISOString();
  } else {
    expires_at = new Date(startMs + durationMs).toISOString();
  }

  const subscriptionExpiry = isPaid ? expires_at.split('T')[0] : null;
  const trialEndsAt = !isPaid ? (merged.trial_ends_at || merged.trialEndsAt || expires_at) : undefined;
  const trialDaysRemaining = !isPaid ? (merged.trial_days_remaining ?? merged.trialDaysRemaining ?? 30) : 0;

  const storeName = merged.store_name || merged.storeName || initialMerchant.storeName;
  const storeSlug = merged.store_slug || merged.storeSlug || (storeName ? storeName.toLowerCase().replace(/[^a-z0-9]/g, '') : 'mystore');
  const ownerName = merged.owner_name || merged.ownerName || merged.full_name || initialMerchant.ownerName;
  const email = (merged.email || initialMerchant.email || '').toLowerCase().trim();
  const phone = merged.phone || initialMerchant.phone;
  const logoUrl = merged.logo_url || merged.logoUrl || initialMerchant.logoUrl;

  return {
    ...initialMerchant,
    ...merged,
    storeName,
    storeSlug,
    ownerName,
    email,
    phone,
    logoUrl,
    subscriptionPlan: planId,
    subscriptionExpiry,
    plan_started_at,
    expires_at,
    planStartedAt: plan_started_at,
    expiresAt: expires_at,
    duration_days: durationDays,
    durationDays: durationDays,
    selectedPlanDays: durationDays,
    trialDaysRemaining,
    trialEndsAt,
    isLocked: false
  };
}

/**
 * Fetches merchant profile and active subscription details from Supabase with fallback to backend APIs
 */
export async function fetchMerchantSubscriptionFromSupabase(
  identifier: { userId?: string; email?: string; phone?: string; slug?: string }
): Promise<MerchantProfile | null> {
  const cleanEmail = identifier.email ? identifier.email.trim().toLowerCase() : '';
  const cleanSlug = identifier.slug ? identifier.slug.trim().toLowerCase() : '';
  const cleanPhone = identifier.phone ? identifier.phone.trim() : '';
  const userId = identifier.userId ? identifier.userId.trim() : '';

  let dbMerchant: any = null;
  let dbSubscription: any = null;

  // Stores are the canonical tenant record. Try every supported ownership/contact
  // column independently because older projects may only have a subset of them.
  if (supabase) {
    const storeQueries: Array<{ column: string; value: string }> = [
      ...(userId ? [{ column: 'user_id', value: userId }, { column: 'auth_user_id', value: userId }] : []),
      ...(cleanEmail ? [{ column: 'email', value: cleanEmail }] : []),
      ...(cleanPhone ? [{ column: 'phone_number', value: cleanPhone }, { column: 'phone', value: cleanPhone }] : [])
    ];
    for (const query of storeQueries) {
      try {
        const { data } = await supabase.from('stores').select('*').eq(query.column, query.value).maybeSingle();
        if (data) {
          dbMerchant = data;
          break;
        }
      } catch (error) {
        // A missing legacy column/table should not prevent the next lookup strategy.
        console.warn(`[SubscriptionService] Store lookup by ${query.column} skipped:`, error);
      }
    }
  }

  // 1. Direct Supabase Query (legacy merchants table fallback)
  if (supabase) {
    try {
      if (!dbMerchant && userId) {
        const { data: mData } = await supabase
          .from('stores')
          .select('*')
          .or(`auth_user_id.eq.${userId},id.eq.${userId}`)
          .maybeSingle();
        if (mData) {
          dbMerchant = mData;
          if (mData.email) {
            const { data: sData } = await supabase
              .from('subscriptions')
              .select('*')
              .ilike('merchant_email', mData.email)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (sData) dbSubscription = sData;
          }
        }
      }

      if (!dbMerchant && cleanEmail) {
        const { data: mData } = await supabase
          .from('stores')
          .select('*')
          .ilike('email', cleanEmail)
          .maybeSingle();
        if (mData) dbMerchant = mData;

        const { data: sData } = await supabase
          .from('subscriptions')
          .select('*')
          .ilike('merchant_email', cleanEmail)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (sData) dbSubscription = sData;
      } else if (!dbMerchant && cleanSlug) {
        const { data: mData } = await supabase
          .from('stores')
          .select('*')
          .ilike('store_slug', cleanSlug)
          .maybeSingle();
        if (mData) dbMerchant = mData;

        if (mData?.email) {
          const { data: sData } = await supabase
            .from('subscriptions')
            .select('*')
            .ilike('merchant_email', mData.email)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (sData) dbSubscription = sData;
        }
      }
    } catch (err) {
      console.warn('[SubscriptionService] Supabase direct fetch warning:', err);
    }
  }

  // 2. Server API fallback check
  if (!dbMerchant) {
    try {
      if (cleanEmail) {
        const res = await fetch(`/api/stores/check/${encodeURIComponent(cleanEmail)}`, {
          headers: { 'Accept': 'application/json' }
        });
        const data = await safeParseJson(res, null);
        if (data) dbMerchant = data;
      } else if (cleanSlug) {
        const res = await fetch(`/api/stores/by-slug?slug=${encodeURIComponent(cleanSlug)}`, {
          headers: { 'Accept': 'application/json' }
        });
        const data = await safeParseJson(res, null);
        if (data?.merchant) dbMerchant = data.merchant;
      }
    } catch (err) {
      console.warn('[SubscriptionService] Backend API fetch warning:', err);
    }
  }

  if (!dbMerchant && !dbSubscription) {
    return null;
  }

  return resolveMerchantSubscription(dbMerchant, dbSubscription);
}

/**
 * Universal Subscription Synchronizer:
 * Updates the merchant's subscription plan, duration (30/90/180/365 days),
 * and expiration timestamps across Supabase, Backend API, and Local Storage.
 */
export async function syncMerchantSubscription(
  options: SubscriptionSyncOptions
): Promise<{ success: boolean; updatedProfile: MerchantProfile }> {
  const { merchant, planId, startDate = new Date(), transactionId, paymentMethod, status = 'active' } = options;

  const durationDays = getPlanDurationInDays(planId);
  const { plan_started_at, expires_at, expiryDate, durationMs } = calculatePlanTimestamps(planId, startDate);
  const isPaid = planId !== 'free_trial' && planId !== 'trial';

  const updatedProfile: MerchantProfile = {
    ...merchant,
    subscriptionPlan: planId as SubscriptionPlanId,
    subscriptionExpiry: isPaid ? expiryDate : null,
    plan_started_at,
    expires_at,
    planStartedAt: plan_started_at,
    expiresAt: expires_at,
    duration_days: durationDays,
    durationDays: durationDays,
    selectedPlanDays: durationDays,
    trialDaysRemaining: isPaid ? 0 : 30,
    trialEndsAt: isPaid ? undefined : expires_at,
    isLocked: false
  };

  const cleanEmail = (updatedProfile.email || '').trim().toLowerCase();
  const cleanSlug = updatedProfile.storeSlug || updatedProfile.storeName.toLowerCase().replace(/[^a-z0-9]/g, '');

  // 1. Sync to Supabase `stores` and `subscriptions`
  if (supabase && cleanEmail) {
    try {
      await supabase
        .from('stores')
        .upsert({
          email: cleanEmail,
          store_name: updatedProfile.storeName,
          store_slug: cleanSlug,
          owner_name: updatedProfile.ownerName,
          phone: updatedProfile.phone,
          subscription_plan: planId,
          subscription_expiry: expiryDate,
          plan_started_at,
          expires_at,
          duration_days: durationDays,
          trial_days_remaining: isPaid ? 0 : 30,
          trial_ends_at: isPaid ? null : expires_at,
          updated_at: new Date().toISOString()
        }, { onConflict: 'email' });

      await supabase
        .from('subscriptions')
        .upsert([{
          merchant_email: cleanEmail,
          store_slug: cleanSlug,
          subscription_plan: planId,
          plan_started_at,
          expires_at,
          duration_days: durationDays,
          transaction_id: transactionId || null,
          payment_method: paymentMethod || null,
          status: status,
          updated_at: new Date().toISOString()
        }]);
    } catch (sbErr) {
      console.warn('[SubscriptionService] Supabase sync notice:', sbErr);
    }
  }

  // 2. Sync to Backend Server Endpoint `/api/subscription/update`
  try {
    await fetch('/api/subscription/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeName: updatedProfile.storeName,
        storeSlug: cleanSlug,
        email: cleanEmail,
        planId,
        expiryDate,
        plan_started_at,
        expires_at,
        duration_days: durationDays,
        selectedPlanDays: durationDays,
        transactionId,
        paymentMethod
      })
    });
  } catch (srvErr) {
    console.warn('[SubscriptionService] Server update notice:', srvErr);
  }

  // 3. Update Local Storage & Cross-Tab Broadcasts
  try {
    localStorage.setItem('zid_auth_session', JSON.stringify({
      email: cleanEmail,
      loggedInAt: new Date().toISOString(),
      userProfile: updatedProfile
    }));

    writeZidStoreData({ merchant: updatedProfile }, cleanSlug);

    // Update registered users registry
    const registered = localStorage.getItem('zid_registered_users');
    if (registered) {
      const users = JSON.parse(registered);
      if (Array.isArray(users)) {
        const updated = users.map((u: any) =>
          u && u.email && u.email.toLowerCase() === cleanEmail
            ? { ...u, subscriptionPlan: planId, plan_started_at, expires_at, duration_days: durationDays }
            : u
        );
        localStorage.setItem('zid_registered_users', JSON.stringify(updated));
      }
    }

    // Update all merchants registry
    const allM = localStorage.getItem('ZID_ALL_MERCHANTS');
    if (allM) {
      const list = JSON.parse(allM);
      if (Array.isArray(list)) {
        const updated = list.map((m: any) =>
          m && ((m.email && m.email.toLowerCase() === cleanEmail) || (m.storeName && m.storeName === updatedProfile.storeName))
            ? { ...m, ...updatedProfile }
            : m
        );
        localStorage.setItem('ZID_ALL_MERCHANTS', JSON.stringify(updated));
      }
    }
  } catch (lsErr) {
    console.error('[SubscriptionService] Local storage sync error:', lsErr);
  }

  return { success: true, updatedProfile };
}

/**
 * Realtime Supabase Subscription Listener for Production (Vercel & Live Supabase):
 * Native Supabase Realtime subscription (`supabase.channel().on('postgres_changes', ...)`).
 * When Super Admin approves/accepts a plan request or updates the record directly in Supabase:
 * 1. Listens to postgres_changes on both 'stores' and 'subscriptions' tables.
 * 2. Matches incoming changes to the logged-in merchant's email, store slug, or user ID.
 * 3. Immediately normalizes the updated plan & timestamps into a live MerchantProfile.
 * 4. Invokes onUpdate to switch the UI state to ACTIVE instantly without requiring a page refresh.
 */
export function subscribeToMerchantSubscription(
  merchant: { id?: string; email?: string; storeSlug?: string; storeName?: string } | null,
  onUpdate: (updatedMerchant: MerchantProfile, source: 'merchants' | 'subscriptions') => void
): () => void {
  if (!supabase || !merchant) {
    return () => {};
  }

  const cleanEmail = (merchant.email || '').trim().toLowerCase();
  const cleanSlug = (merchant.storeSlug || merchant.storeName || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const merchantId = (merchant.id || '').trim();

  // Unique channel identifier
  const channelName = `sub-realtime-${cleanEmail || cleanSlug || merchantId || 'live'}-${Math.random().toString(36).substring(2, 7)}`;

  try {
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stores'
        },
        async (payload) => {
          try {
            const newRecord: any = payload.new || {};
            const oldRecord: any = payload.old || {};
            const recEmail = (newRecord.email || oldRecord.email || '').trim().toLowerCase();
            const recSlug = (newRecord.store_slug || oldRecord.store_slug || '').trim().toLowerCase();
            const recId = String(newRecord.id || oldRecord.id || newRecord.auth_user_id || '');

            const isMatch =
              (cleanEmail && recEmail && cleanEmail === recEmail) ||
              (cleanSlug && recSlug && cleanSlug === recSlug) ||
              (merchantId && recId && merchantId === recId);

            if (isMatch) {
              console.log('[Supabase Realtime] Stores table update received:', newRecord);
              // Re-fetch complete resolved profile from Supabase to guarantee all fields are fresh
              const refreshed = await fetchMerchantSubscriptionFromSupabase({
                email: cleanEmail || recEmail,
                slug: cleanSlug || recSlug,
                userId: merchantId || recId
              });

              if (refreshed) {
                // Update local storage session
                try {
                  const saved = localStorage.getItem('zid_auth_session');
                  if (saved) {
                    const parsed = JSON.parse(saved);
                    parsed.userProfile = refreshed;
                    localStorage.setItem('zid_auth_session', JSON.stringify(parsed));
                  }
                  writeZidStoreData({ merchant: refreshed }, refreshed.storeSlug || cleanSlug);
                } catch (e) {}

                onUpdate(refreshed, 'merchants');
              } else if (payload.new) {
                const resolved = resolveMerchantSubscription(payload.new);
                onUpdate(resolved, 'merchants');
              }
            }
          } catch (err) {
            console.warn('[Supabase Realtime] Error handling merchant change:', err);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'subscriptions'
        },
        async (payload) => {
          try {
            const newRecord: any = payload.new || {};
            const oldRecord: any = payload.old || {};
            const recEmail = (newRecord.merchant_email || oldRecord.merchant_email || '').trim().toLowerCase();
            const recSlug = (newRecord.store_slug || oldRecord.store_slug || '').trim().toLowerCase();

            const isMatch =
              (cleanEmail && recEmail && cleanEmail === recEmail) ||
              (cleanSlug && recSlug && cleanSlug === recSlug);

            if (isMatch) {
              console.log('[Supabase Realtime] Subscriptions table update received:', newRecord);
              const refreshed = await fetchMerchantSubscriptionFromSupabase({
                email: cleanEmail || recEmail,
                slug: cleanSlug || recSlug
              });

              if (refreshed) {
                try {
                  const saved = localStorage.getItem('zid_auth_session');
                  if (saved) {
                    const parsed = JSON.parse(saved);
                    parsed.userProfile = refreshed;
                    localStorage.setItem('zid_auth_session', JSON.stringify(parsed));
                  }
                  writeZidStoreData({ merchant: refreshed }, refreshed.storeSlug || cleanSlug);
                } catch (e) {}

                onUpdate(refreshed, 'subscriptions');
              } else if (payload.new) {
                const resolved = resolveMerchantSubscription(merchant, payload.new);
                onUpdate(resolved, 'subscriptions');
              }
            }
          } catch (err) {
            console.warn('[Supabase Realtime] Error handling subscription change:', err);
          }
        }
      )
      .subscribe((status, err) => {
        if (err) {
          console.warn(`[Supabase Realtime] Subscription status: ${status}, error:`, err);
        } else {
          console.log(`[Supabase Realtime] Connected channel ${channelName}, status: ${status}`);
        }
      });

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (e) {
        console.warn('[Supabase Realtime] Channel cleanup notice:', e);
      }
    };
  } catch (e) {
    console.warn('[Supabase Realtime] Subscription initialization warning:', e);
    return () => {};
  }
}

