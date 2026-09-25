import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MerchantProfile, SubscriptionRequest } from '../types';
import { getPlanDisplayName, getPlanDurationInDays, isPaidSubscriptionActive, toUtcMs, TRIAL_DURATION_DAYS } from '../utils/subscriptionUtils';
import { supabase } from '../lib/supabase';
import { subscribeToSubscriptionStatus } from '../lib/subscriptionStatusCache';
import { BrandLogo } from './BrandLogo';
import SafeImage from './SafeImage';
import {
  Sparkles,
  ExternalLink,
  Bell,
  Globe,
  Clock,
  ChevronRight,
  LogOut,
  Search,
  Plus,
  Bot,
  X,
  Package,
  ShoppingBag,
  Users,
  Tag,
  CheckCircle2,
  Send,
  Moon,
  Sun,
  Menu,
  ShieldAlert,
  HelpCircle,
  Trash2,
  Copy
} from 'lucide-react';

interface HeaderProps {
  merchant: MerchantProfile;
  orders?: any[];
  products?: any[];
  merchants?: MerchantProfile[];
  pendingRequests?: SubscriptionRequest[];
  platformSettings?: any;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onOpenSubscriptionModal: () => void;
  onOpenStorefrontPreview: () => void;
  onToggleCurrency: () => void;
  onLogout: () => void;
  onNavigateTab?: (tab: any) => void;
  onQuickAddProduct?: () => void;
  onToggleSidebarMobile?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  merchant,
  orders = [],
  products = [],
  merchants = [],
  pendingRequests = [],
  platformSettings,
  isDarkMode,
  onToggleTheme,
  onOpenSubscriptionModal,
  onOpenStorefrontPreview,
  onToggleCurrency,
  onLogout,
  onNavigateTab,
  onQuickAddProduct,
  onToggleSidebarMobile,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter Orders, Products, Merchants
  const filteredOrders = orders.filter((o: any) =>
    o.id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    o.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    o.customerPhone?.includes(searchQuery)
  );

  const filteredProducts = products.filter((p: any) =>
    p.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.sku?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredMerchants = merchants.filter((m: any) =>
    m.storeName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.storeSlug?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.ownerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const [aiResponses, setAiResponses] = useState<Array<{ sender: 'user' | 'ai'; text: string }>>([
    {
      sender: 'ai',
      text: `Marhaba! I am Zid AI Assistant. How can I help boost sales for ${merchant?.storeName || 'your store'} today? I can help optimize product titles, write marketing WhatsApp copy, or check bKash settlements.`
    }
  ]);

  // Ctrl + K Global Search Shortcut Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Dynamic Subscription & Trial Calculations
  //
  // A request is only treated as "awaiting approval" when BOTH the local record
  // and the database agree. The admin approves against MongoDB, so relying on the
  // localStorage copy alone left the banner stuck on PENDING_APPROVAL in a tab
  // that had been open before the approval.
  const [dbSubscriptionStatus, setDbSubscriptionStatus] = useState<string | null>(null);
  // The DB-resolved plan name and expiry, so the header can render the ACTIVE
  // plan directly rather than inferring it from a stale local merchant record.
  const [dbPlanName, setDbPlanName] = useState<string | null>(null);
  const [dbExpiresAt, setDbExpiresAt] = useState<string | null>(null);
  const [dbPlanStartedAt, setDbPlanStartedAt] = useState<string | null>(null);
  const [dbDurationDays, setDbDurationDays] = useState<number | null>(null);
  const [dbPlanId, setDbPlanId] = useState<string | null>(null);

  const pendingRequest = pendingRequests?.find(
    r => r.status === 'pending' && (
      (r.email && merchant?.email && r.email.toLowerCase() === merchant.email.toLowerCase()) ||
      (r.storeName && merchant?.storeName && r.storeName.toLowerCase() === merchant.storeName.toLowerCase())
    )
  );

  // The database is authoritative: once it reports ACTIVE, the pending banner is
  // suppressed even if a stale request row still says 'pending' locally.
  const dbReportsActive = (dbSubscriptionStatus || '').toUpperCase() === 'ACTIVE';
  const showPendingBanner = Boolean(pendingRequest) && !dbReportsActive;

  // Supabase fetched active subscription record
  const [supabaseSub, setSupabaseSub] = useState<{
    plan_started_at?: string;
    expires_at?: string;
    plan_start_date?: string;
    subscription_start_date?: string;
    created_at?: string;
    duration_days?: number;
    selected_plan_days?: number;
    subscription_plan?: string;
    subscription_expiry?: string;
    subscription_end_date?: string;
    trial_ends_at?: string;
  } | null>(null);

  const isPaid = useMemo(() => {
    // SINGLE SOURCE OF TRUTH, in priority order:
    //   1. MongoDB `subscription_status === 'ACTIVE'` — what an admin approval
    //      writes. This WINS outright, so an approved store can never fall back
    //      to the trial countdown just because its local profile is stale.
    //   2. A paid plan on the local merchant profile (fast first paint).
    //   3. A paid plan on the legacy Supabase record.
    if (dbReportsActive) return true;
    if (isPaidSubscriptionActive(merchant)) return true;
    const subPlan = supabaseSub?.subscription_plan;
    return Boolean(subPlan && subPlan !== 'free_trial' && subPlan !== 'trial');
  }, [dbReportsActive, merchant, supabaseSub]);

  // 1. Connect to Supabase: Fetch active merchant's real subscription record directly from Supabase & Listen to Realtime changes
  useEffect(() => {
    let isMounted = true;
    if (!supabase || !merchant) return;

    const email = (merchant.email || '').trim().toLowerCase();
    const storeSlug = (merchant.storeSlug || merchant.storeName || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

    const fetchSupabaseSubRecord = async () => {
      try {
        // Query the 'subscriptions' table in Supabase. When the table is not yet
        // provisioned (PGRST205 / 404) we fall through to the 'stores' fallback
        // instead of letting the missing-table error surface as a broken row.
        // Avoid PostgREST `.or(...)` filter grammar for user-supplied email/
        // slug values. An empty operand or a special character such as `@`
        // can turn the generated request into HTTP 400. Equality filters are
        // encoded safely by the Supabase client and have the same semantics for
        // these canonical identity fields.
        // ── Supabase is a BEST-EFFORT fallback, never the source of truth ─────
        //
        // MongoDB is authoritative (see the `/api/subscription/status` effect).
        // This legacy read used to run unconditionally and produced the failing
        // `subscriptions?select=*&merchant_email=eq.…` request in the network
        // tab: the live Supabase schema lacks that column, so PostgREST answered
        // HTTP 400 with SQLSTATE 42703.
        //
        // It is skipped entirely once MongoDB has already reported an ACTIVE
        // plan, because there is nothing left for it to contribute — and when it
        // does run, a missing table/column is treated as "no data" rather than
        // an error worth retrying on every render.
        if (dbReportsActive) return;

        let subData: any = null;
        let subError: any = null;
        if (email) {
          const result = await supabase
            .from('subscriptions')
            .select('*')
            .eq('merchant_email', email)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          subData = result.data;
          subError = result.error;
        }
        if (!subData && !subError && storeSlug) {
          const result = await supabase
            .from('subscriptions')
            .select('*')
            .eq('store_slug', storeSlug)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          subData = result.data;
          subError = result.error;
        }

        // A missing table or column is an expected deployment state, not a
        // failure — logged once at debug level, never surfaced as a red row.
        if (subError && !/does not exist|PGRST205|schema cache|42703|invalid input/i.test(subError.message || '')) {
          console.warn('Supabase subscriptions read notice:', subError.message);
        }
        if (subError) {
          // Do not proceed to the `stores` fallback in Supabase either: the same
          // schema drift would produce a second failing request.
          return;
        }

        if (subData && isMounted) {
          setSupabaseSub(subData);
          return;
        }

        // Fallback: Query 'stores' table in Supabase
        let mData: any = null;
        if (email) {
          const result = await supabase
            .from('stores')
            .select('*')
            .eq('email', email)
            .maybeSingle();
          mData = result.data;
        }
        if (!mData && storeSlug) {
          const result = await supabase
            .from('stores')
            .select('*')
            .eq('store_slug', storeSlug)
            .maybeSingle();
          mData = result.data;
        }

        if (mData && isMounted) {
          setSupabaseSub(mData);
        }
      } catch (err) {
        console.warn('Supabase subscription fetch notice:', err);
      }
    };

    // The shared MongoDB subscription cache owns the one session read. This
    // legacy channel is event-only: no render-time fallback request, while plan
    // changes still arrive without a page refresh.
    // Set up Realtime listener for Postgres Changes on merchants & subscriptions
    const channelId = `header-sub-realtime-${email || storeSlug || 'user'}-${Math.random().toString(36).substring(2, 6)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'subscriptions'
        },
        (payload) => {
          if (!isMounted) return;
          const newRec: any = payload.new || {};
          const recEmail = (newRec.merchant_email || '').trim().toLowerCase();
          const recSlug = (newRec.store_slug || '').trim().toLowerCase();
          if ((email && recEmail === email) || (storeSlug && recSlug === storeSlug)) {
            console.log('[Header Realtime] Received live subscription update:', newRec);
            setSupabaseSub(newRec);
            fetchSupabaseSubRecord();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'merchants'
        },
        (payload) => {
          if (!isMounted) return;
          const newRec: any = payload.new || {};
          const recEmail = (newRec.email || '').trim().toLowerCase();
          const recSlug = (newRec.store_slug || '').trim().toLowerCase();
          if ((email && recEmail === email) || (storeSlug && recSlug === storeSlug)) {
            console.log('[Header Realtime] Received live merchant update:', newRec);
            setSupabaseSub(newRec);
            fetchSupabaseSubRecord();
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      try {
        supabase.removeChannel(channel);
      } catch (e) {}
    };
  }, [merchant?.email, merchant?.storeSlug]);

  // ── Deterministic trial / plan countdown ──────────────────────────────────
  //
  // WHY THIS WAS UNSTABLE (30 → 28 → 30 on refresh)
  //
  // The old implementation anchored on `getStablePlanStartMs`, which — when the
  // merchant record carried no start timestamp yet — wrote `Date.now()` into
  // localStorage and used that as the trial start. The Supabase subscription row
  // then arrived a moment later with a DIFFERENT start date, so the anchor moved
  // and the counter recomputed from a new baseline. Whichever of the two landed
  // last decided whether the badge said 30 or 28.
  //
  // The fix is to remove every source of variance:
  //   • ONE anchor — the account creation timestamp the server stores
  //     (`trial_start_date`, else `created_at`), fetched from MongoDB.
  //   • ONE formula — `calculateTrialDaysRemaining` (UTC, floor), shared with the
  //     server and the billing page.
  //   • NO localStorage anchor, NO `Date.now()` fallback, NO random jitter.
  //
  // When no anchor is available we report `null` and the badge shows a neutral
  // "trial" label rather than inventing a number that changes on refresh.
  const [trialAnchorIso, setTrialAnchorIso] = useState<string | null>(null);

  // ONE shared read per store identity.
  //
  // This effect used to own its own `fetch` + 30s `setInterval` while `App` ran a
  // second, identical loop for the same endpoint. `App` also rewrites `merchant`
  // on nearly every load, which re-ran the effect's dependency array and started
  // yet another interval — so each render cycle added requests that never
  // settled. The 80+ pending/400 rows in DevTools were this.
  //
  // `subscribeToSubscriptionStatus` collapses both loops into one cached
  // subscription: the request is deduped across every consumer, the result is
  // cached, and ONE shared timer (not one per component) refreshes it. It also
  // calls back SYNCHRONOUSLY with any cached value, so a store that is already
  // Pro paints as Pro on the first frame instead of flashing a locked badge.
  useEffect(() => {
    const email = (merchant?.email || '').trim();
    const slug = (merchant?.storeSlug || merchant?.storeName || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    if (!email && !slug) return;

    return subscribeToSubscriptionStatus(email, slug, (snapshot) => {
      // ── SINGLE SOURCE OF TRUTH ────────────────────────────────────────────
      // MongoDB is authoritative for activation state. An approved store MUST
      // render its ACTIVE paid plan and must never fall through to the trial
      // countdown, so every value the header needs is captured here.
      if (snapshot.status) setDbSubscriptionStatus(snapshot.status);
      if (snapshot.planId) setDbPlanId(snapshot.planId);
      if (snapshot.planName) setDbPlanName(snapshot.planName);
      if (snapshot.expiresAt) setDbExpiresAt(snapshot.expiresAt);
      if (snapshot.planStartedAt) setDbPlanStartedAt(snapshot.planStartedAt);
      if (snapshot.durationDays) setDbDurationDays(snapshot.durationDays);
      // `trial_start_date` is authoritative; `created_at` is the fallback that
      // is always present on a real MongoDB store document.
      if (snapshot.anchorIso) setTrialAnchorIso(snapshot.anchorIso);
    });
  }, [merchant?.email, merchant?.storeSlug, merchant?.storeName]);

  // Static countdown snapshot — computed ONCE per relevant input change.
  //
  // The previous implementation re-ran this on a 1-second interval, which
  // re-rendered the entire header (and forced React to reconcile the whole
  // dashboard tree on every tick). We now compute whole days only, which is all
  // the badge ever needs to communicate, so no interval is required at all.
  const timeLeft = useMemo(() => {
    // The plan the badge reflects. The DB-resolved plan id WINS when the store is
    // ACTIVE, so an approved Pro plan renders as Pro even if the local merchant
    // record still says `free_trial`.
    const activePlan =
      (dbReportsActive && dbPlanId) ||
      supabaseSub?.subscription_plan ||
      merchant?.subscriptionPlan ||
      'free_trial';
    const isPaidPlanActive = dbReportsActive || (activePlan !== 'free_trial' && activePlan !== 'trial');

    // Duration comes from the DB when it recorded one, so a 180-day Pro plan is
    // not silently recomputed as a 30-day window from the plan-id guess.
    const durationDays = dbDurationDays && dbDurationDays > 0
      ? dbDurationDays
      : getPlanDurationInDays(activePlan);
    const durationMs = durationDays * 24 * 60 * 60 * 1000;

    let targetTimestamp: number;

    if (isPaidPlanActive) {
      // The DB's expiry is authoritative for an ACTIVE store.
      const explicitExpiryMs = toUtcMs(
        dbExpiresAt ||
          merchant?.expires_at ||
          (merchant as any)?.expiresAt ||
          merchant?.subscriptionExpiry ||
          merchant?.subscriptionEndDate ||
          supabaseSub?.expires_at ||
          supabaseSub?.subscription_expiry ||
          supabaseSub?.subscription_end_date
      );

      const planStartMs = toUtcMs(
        dbPlanStartedAt ||
          merchant?.plan_started_at ||
          (merchant as any)?.planStartedAt ||
          merchant?.subscriptionStartDate ||
          supabaseSub?.plan_started_at ||
          supabaseSub?.plan_start_date ||
          supabaseSub?.created_at
      );

      // Trust an explicit expiry that is close to the plan's real duration;
      // otherwise recompute from the start so a legacy row cannot show a bogus
      // multi-year window. Never re-anchor to "now" — an expired plan must read
      // as expired, not silently restart.
      if (explicitExpiryMs > 0 && explicitExpiryMs > planStartMs + (durationDays - 15) * 86400000) {
        targetTimestamp = explicitExpiryMs;
      } else if (planStartMs > 0) {
        targetTimestamp = planStartMs + durationMs;
      } else {
        targetTimestamp = explicitExpiryMs;
      }
    } else {
      // Free trial. An explicit trial end wins; otherwise 30 days from the
      // account-creation anchor the server gave us. If neither exists the
      // countdown stays at zero rather than inventing a start date.
      const trialExpiryMs = toUtcMs(
        merchant?.expires_at ||
          (merchant as any)?.expiresAt ||
          merchant?.trialEndsAt ||
          supabaseSub?.expires_at ||
          supabaseSub?.trial_ends_at
      );

      const anchorMs = toUtcMs(trialAnchorIso);

      if (trialExpiryMs > 0) {
        targetTimestamp = trialExpiryMs;
      } else if (anchorMs > 0) {
        targetTimestamp = anchorMs + TRIAL_DURATION_DAYS * 86400000;
      } else {
        targetTimestamp = 0;
      }
    }

    // Whole days remaining — the only granularity the static badge shows.
    const computeTimeLeft = () => {
      if (!targetTimestamp) {
        return { days: 0, totalDaysFloat: 0 };
      }
      const diffMs = Math.max(0, targetTimestamp - Date.now());
      return {
        days: Math.floor(diffMs / (1000 * 60 * 60 * 24)),
        totalDaysFloat: diffMs / (1000 * 60 * 60 * 24),
      };
    };

    return computeTimeLeft();
  }, [
    supabaseSub,
    trialAnchorIso,
    dbReportsActive,
    dbPlanId,
    dbPlanName,
    dbExpiresAt,
    dbPlanStartedAt,
    dbDurationDays,
    merchant?.expires_at,
    (merchant as any)?.expiresAt,
    merchant?.plan_started_at,
    (merchant as any)?.planStartedAt,
    merchant?.subscriptionStartDate,
    merchant?.subscriptionEndDate,
    merchant?.subscriptionExpiry,
    merchant?.trialEndsAt,
    merchant?.selectedPlanDays,
    merchant?.subscriptionPlan
  ]);

  // The label shown for an ACTIVE plan (e.g. "ACTIVE PLAN: PRO PLAN (6 MONTHS)").
  // Built from the DB's `plan_name` first so the header states exactly what the
  // admin approved, and only falls back to deriving it from the plan id.
  const activePlanLabel = useMemo(() => {
    if (!isPaid) return null;
    const name = dbPlanName || getPlanDisplayName(dbPlanId || merchant?.subscriptionPlan);
    return name.toUpperCase();
  }, [isPaid, dbPlanName, dbPlanId, merchant?.subscriptionPlan]);

  const activePlanDaysLabel = dbDurationDays && dbDurationDays > 0
    ? `${dbDurationDays} DAYS`
    : `${getPlanDurationInDays(dbPlanId || merchant?.subscriptionPlan)} DAYS`;

  // Static expiry date (YYYY-MM-DD) for the ACTIVE plan badge. UTC-rendered so
  // the date does not shift by a day depending on the viewer's timezone.
  const activePlanExpiry = useMemo(() => {
    if (!isPaid) return null;
    const ms = toUtcMs(
      dbExpiresAt ||
        merchant?.expires_at ||
        (merchant as any)?.expiresAt ||
        merchant?.subscriptionExpiry ||
        merchant?.subscriptionEndDate ||
        supabaseSub?.expires_at ||
        supabaseSub?.subscription_expiry ||
        supabaseSub?.subscription_end_date
    );
    if (!ms) return null;
    return new Date(ms).toISOString().slice(0, 10);
  }, [
    isPaid,
    dbExpiresAt,
    merchant?.expires_at,
    (merchant as any)?.expiresAt,
    merchant?.subscriptionExpiry,
    merchant?.subscriptionEndDate,
    supabaseSub?.expires_at,
    supabaseSub?.subscription_expiry,
    supabaseSub?.subscription_end_date,
  ]);

  const paidDaysRemaining = timeLeft.days;
  const trialDaysRemaining = timeLeft.days;
  const trialDaysTotal = merchant?.trialDaysTotal ?? merchant?.selectedPlanDays ?? TRIAL_DURATION_DAYS;
  const trialPercentage = Math.min(100, Math.max(0, Math.round(((trialDaysTotal - trialDaysRemaining) / trialDaysTotal) * 100)));

  const notificationsList = [
    { id: 1, title: 'New bKash Order #ZID-9082', desc: 'Customer Paid ৳3,400 via bKash TrxID #8X92K1', time: '5m ago', unread: true },
    { id: 2, title: 'Courier Pickup Dispatched', desc: 'Packages picked up from your warehouse', time: '1h ago', unread: true },
    { id: 3, title: 'WhatsApp Bot Active', desc: 'Sent 12 order tracking links automatically', time: '3h ago', unread: false },
  ];

  const handleAiSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;
    const userMsg = aiPrompt.trim();
    setAiResponses(prev => [...prev, { sender: 'user', text: userMsg }]);
    setAiPrompt('');

    setTimeout(() => {
      let reply = `Zid AI Analysis for "${userMsg}":\n\nI recommend creating a 10% discount coupon in Marketing, turning on WhatsApp Bot for instant receipt delivery, and adding 2 trending products to Ethnic Wear collection!`;
      if (userMsg.toLowerCase().includes('bkash') || userMsg.toLowerCase().includes('payment')) {
        reply = `Zid AI Payment Insight: bKash conversion rate is currently 4.2% higher when 1-tap merchant checkout is highlighted at cart checkout.`;
      } else if (userMsg.toLowerCase().includes('product') || userMsg.toLowerCase().includes('stock')) {
        reply = `Zid AI Stock Suggestion: Your top selling item is Jamdani Saree. You should restock 15 units before weekend sales.`;
      }
      setAiResponses(prev => [...prev, { sender: 'ai', text: reply }]);
    }, 600);
  };

  return (
    <header className={`border-b sticky top-0 z-30 px-4 lg:px-6 py-3 space-y-3 transition-colors ${
      isDarkMode ? 'bg-[#1D212E] border-[#2E3548] text-slate-100' : 'bg-white border-slate-200 text-slate-900'
    }`}>
      {/* FULL-WIDTH RED WARNING BANNER WHEN <= 10 DAYS REMAINING */}
      {timeLeft.totalDaysFloat <= 10 && (
        <div className="w-full bg-red-600 border-b border-red-700 text-white font-bold py-2.5 px-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-2 shadow-lg animate-pulse">
          <div className="flex items-center gap-2 text-xs sm:text-sm text-center sm:text-left">
            <ShieldAlert className="w-5 h-5 text-white shrink-0 animate-bounce" />
            <span>
              ⚠️ Super Admin Notice: Your subscription plan expires in{' '}
              <span className="font-mono font-black underline bg-red-700/60 px-1.5 py-0.5 rounded">
                {timeLeft.days} {timeLeft.days === 1 ? 'day' : 'days'}
              </span>! Please renew your plan immediately.
            </span>
          </div>
          <button
            onClick={onOpenSubscriptionModal}
            className="bg-white text-red-700 hover:bg-red-50 text-xs px-3.5 py-1.5 rounded-lg font-extrabold transition shadow shrink-0 cursor-pointer"
          >
            Renew Plan Now
          </button>
        </div>
      )}

      {/* Subscription / Trial Status Banner */}
      {showPendingBanner ? (
        // PENDING APPROVAL BANNER
        <div className="bg-gradient-to-r from-[#241E14] via-[#332A1C] to-[#241E14] border border-amber-500/40 rounded-xl p-3 shadow-md">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                <Clock className="w-4 h-4 animate-pulse text-amber-400" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300 bg-amber-500/20 px-2.5 py-0.5 rounded-full border border-amber-500/40 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
                    Status: PENDING_APPROVAL
                  </span>
                  <span className="text-xs text-amber-200/90 font-medium">
                    • Requested: {pendingRequest.planName} (TrxID: {pendingRequest.transactionId})
                  </span>
                </div>
                <p className="text-xs text-slate-200 font-medium mt-0.5">
                  Subscription Status: <span className="text-amber-300 font-bold">Awaiting Super Admin Verification</span>. Your plan duration will activate immediately once approved.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => alert(`Pending Subscription Request:\n• Plan: ${pendingRequest.planName}\n• Amount: ৳${pendingRequest.amountBDT?.toLocaleString()} BDT\n• Payment: ${pendingRequest.paymentMethod}\n• TrxID: ${pendingRequest.transactionId}\n• Status: Pending Super Admin Approval\n\nOur administration team is verifying your bKash payment.`)}
                className="p-2 text-slate-300 hover:text-amber-300 bg-[#282117] hover:bg-[#342C1E] rounded-xl border border-amber-500/30 transition cursor-pointer text-xs flex items-center gap-1.5 px-3 py-1.5"
                title="View Verification Status"
              >
                <HelpCircle className="w-4 h-4 text-amber-400" />
                <span className="text-amber-200 text-xs font-semibold">Verification In Progress</span>
              </button>

              <button
                onClick={onOpenSubscriptionModal}
                className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all shadow-md shadow-amber-500/20 cursor-pointer shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5 fill-slate-950" />
                <span>Subscription Info</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : isPaid ? (
        // ACTIVE PAID SUBSCRIPTION — STATIC PLAN BADGE (no live ticking clock)
        <div className="bg-gradient-to-r from-[#142328] via-[#1A2E35] to-[#142328] border border-[#00D68F]/30 rounded-xl p-3 shadow-md">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-[#00D68F]/20 border border-[#00D68F]/40 flex items-center justify-center text-[#00D68F] shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#00D68F] bg-[#00D68F]/10 px-2 py-0.5 rounded-full border border-[#00D68F]/30 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-[#00D68F]" />
                    {/* Label comes from the MongoDB `plan_name`, so the header states
                        exactly what the admin approved — e.g. "ACTIVE PLAN: PRO PLAN (6 MONTHS)". */}
                    Active Plan: {activePlanLabel} ({activePlanDaysLabel})
                  </span>
                  <span className="text-xs text-slate-400 font-medium hidden sm:inline">
                    • Pure SaaS — 0% Order Fees
                  </span>
                </div>
                {/* Static expiry date — no per-second re-render. */}
                <p className="text-xs text-slate-300 font-medium mt-1">
                  Expires:{' '}
                  <span className="font-mono font-bold text-[#00D68F]">
                    {activePlanExpiry || paidDaysRemaining + ' days left'}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => alert('Support Center: Opening Zid Merchant Help Desk...')}
                className="p-2 text-slate-300 hover:text-[#00D68F] bg-[#202E34] hover:bg-[#283C44] rounded-xl border border-[#00D68F]/20 transition cursor-pointer"
                title="Help & Support"
              >
                <HelpCircle className="w-4 h-4" />
              </button>

              <button
                onClick={onOpenSubscriptionModal}
                className="bg-gradient-to-r from-[#00D68F] to-[#00B377] hover:from-[#00E699] text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all shadow-md shadow-[#00D68F]/20 cursor-pointer shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5 fill-slate-950" />
                <span>Extend / Upgrade Plan</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        // FREE TRIAL BANNER — STATIC DAYS-LEFT LABEL (no live ticking clock)
        <div className="bg-gradient-to-r from-[#202636] via-[#2A3146] to-[#202636] border border-[#3A435E] rounded-xl p-3 shadow-md">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center text-[#E6C587] shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#E6C587] bg-[#D4AF37]/10 px-2 py-0.5 rounded-full border border-[#D4AF37]/20">
                    Zid Merchant Portal • Free Trial
                  </span>
                  <span className="text-xs text-slate-400 font-medium hidden sm:inline">
                    • 0% Platform Order Fees
                  </span>
                </div>
                {/* Static day count derived from the store-creation anchor. */}
                <p className="text-xs text-slate-200 font-medium mt-1">
                  Trial Period:{' '}
                  <span className="font-mono font-bold text-[#E6C587]">
                    {trialDaysRemaining} {trialDaysRemaining === 1 ? 'Day' : 'Days'} Left
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Trial Bar Visual */}
              <div className="hidden xl:flex flex-col w-40">
                <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                  <span>Trial Progress</span>
                  <span className="font-semibold text-slate-200">{trialDaysTotal - trialDaysRemaining}/{trialDaysTotal} d</span>
                </div>
                <div className="w-full h-1.5 bg-[#161923] rounded-full overflow-hidden border border-[#2E3548]">
                  <div
                    className="h-full bg-gradient-to-r from-[#BF953F] via-[#FCF6BA] to-[#B38728] rounded-full transition-all duration-500"
                    style={{ width: `${trialPercentage}%` }}
                  />
                </div>
              </div>

              <button
                onClick={() => alert('Support Center: Opening Zid Merchant Help Desk...')}
                className="p-2 text-slate-300 hover:text-[#E6C587] bg-[#252B3B] hover:bg-[#2E3548] rounded-xl border border-[#3A435E] transition cursor-pointer"
                title="Help & Support"
              >
                <HelpCircle className="w-4 h-4" />
              </button>

              <button
                onClick={onOpenSubscriptionModal}
                className="bg-gradient-to-r from-[#BF953F] via-[#FCF6BA] to-[#B38728] hover:from-[#FCF6BA] hover:to-[#BF953F] text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all shadow-md shadow-[#D4AF37]/20 cursor-pointer shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5 fill-slate-950" />
                <span>Upgrade / Renew</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Top Header Controls with Search, Zid AI, Notifications, and Quick Add */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Left: Sidebar Collapse Toggle, Zid Logo & Store Name, Quick "+ Add" Button */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {onToggleSidebarMobile && (
            <button
              onClick={onToggleSidebarMobile}
              className="lg:hidden p-2 text-slate-300 hover:text-white bg-[#252B3B] rounded-xl border border-[#3A435E] shrink-0"
              title="Toggle Menu"
            >
              <Menu className="w-4 h-4" />
            </button>
          )}

          <div className="flex items-center gap-2 shrink-0">
            <BrandLogo size="sm" showSubtitle={false} isDarkMode={isDarkMode} />
          </div>

          {/* "+ Add" Quick Action Button */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowQuickAdd(!showQuickAdd)}
              className="flex items-center gap-1 bg-gradient-to-r from-[#BF953F] via-[#FCF6BA] to-[#B38728] hover:from-[#FCF6BA] hover:to-[#BF953F] text-slate-950 text-xs font-extrabold px-3 py-1.5 rounded-xl transition cursor-pointer shadow-md shadow-[#D4AF37]/20"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span>Add</span>
            </button>

            {/* Quick Add Dropdown Menu */}
            {showQuickAdd && (
              <div className="absolute left-0 mt-2 w-48 bg-[#1D212E] border border-[#2E3548] rounded-2xl shadow-xl py-2 z-50 text-xs">
                <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Quick Actions
                </div>
                <button
                  onClick={() => {
                    setShowQuickAdd(false);
                    if (onQuickAddProduct) onQuickAddProduct();
                    else if (onNavigateTab) onNavigateTab('products');
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-[#252B3B] text-slate-200 flex items-center gap-2 cursor-pointer"
                >
                  <Package className="w-3.5 h-3.5 text-[#E6C587]" />
                  <span>Add New Product</span>
                </button>
                <button
                  onClick={() => {
                    setShowQuickAdd(false);
                    if (onNavigateTab) onNavigateTab('orders');
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-[#252B3B] text-slate-200 flex items-center gap-2 cursor-pointer"
                >
                  <ShoppingBag className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Create Manual Order</span>
                </button>
                <button
                  onClick={() => {
                    setShowQuickAdd(false);
                    if (onNavigateTab) onNavigateTab('marketing');
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-[#252B3B] text-slate-200 flex items-center gap-2 cursor-pointer"
                >
                  <Tag className="w-3.5 h-3.5 text-amber-400" />
                  <span>Add Discount Coupon</span>
                </button>
                <button
                  onClick={() => {
                    setShowQuickAdd(false);
                    if (onNavigateTab) onNavigateTab('customers');
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-[#252B3B] text-slate-200 flex items-center gap-2 cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Add Customer</span>
                </button>
              </div>
            )}
          </div>

          {/* Center Search Bar for Desktop with Ctrl + K Shortcut Tag */}
          <div className="relative hidden md:block flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search orders, products, customers..."
              className="w-full bg-[#181B26] text-xs text-slate-200 pl-9 pr-16 py-2 rounded-xl border border-[#2E3548] focus:border-[#D4AF37] focus:outline-none transition"
            />
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <span className="hidden sm:inline-block absolute right-2.5 top-2 text-[10px] font-mono bg-[#252B3B] text-slate-400 border border-[#3A435E] px-1.5 py-0.5 rounded">
                Ctrl + K
              </span>
            )}

            {/* Live Search Results Dropdown */}
            {searchQuery.trim().length > 0 && (
              <div className="absolute left-0 right-0 mt-2 bg-[#1D212E] border border-[#2E3548] rounded-2xl shadow-2xl z-50 overflow-hidden max-h-96 overflow-y-auto text-xs">
                <div className="p-2 border-b border-[#2E3548] bg-[#252B3B] text-[10px] font-bold text-slate-400 uppercase tracking-wider flex justify-between items-center">
                  <span>Search Results for "{searchQuery}"</span>
                  <span className="text-[#E6C587]">{filteredOrders.length + filteredProducts.length + filteredMerchants.length} matches</span>
                </div>

                {/* Orders Section */}
                {filteredOrders.length > 0 && (
                  <div className="p-2 border-b border-[#2E3548]/50">
                    <div className="px-2 py-1 font-bold text-slate-400 uppercase text-[10px]">Store Orders ({filteredOrders.length})</div>
                    {filteredOrders.slice(0, 4).map((o: any) => (
                      <button
                        key={o.id}
                        onClick={() => {
                          setSearchQuery('');
                          if (onNavigateTab) onNavigateTab('orders');
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-[#252B3B] rounded-xl flex items-center justify-between text-slate-200 transition cursor-pointer group"
                      >
                        <div className="flex items-center gap-2">
                          <ShoppingBag className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          <div>
                            <span className="font-bold text-white group-hover:text-[#E6C587]">{o.id}</span>
                            <span className="text-slate-400 ml-2">{o.customerName} ({o.customerPhone})</span>
                          </div>
                        </div>
                        <span className="font-mono text-[#E6C587] font-bold">৳{o.totalAmount}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Products Section */}
                {filteredProducts.length > 0 && (
                  <div className="p-2 border-b border-[#2E3548]/50">
                    <div className="px-2 py-1 font-bold text-slate-400 uppercase text-[10px]">Products ({filteredProducts.length})</div>
                    {filteredProducts.slice(0, 4).map((p: any) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setSearchQuery('');
                          if (onNavigateTab) onNavigateTab('products');
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-[#252B3B] rounded-xl flex items-center justify-between text-slate-200 transition cursor-pointer group"
                      >
                        <div className="flex items-center gap-2">
                          <Package className="w-3.5 h-3.5 text-[#E6C587] shrink-0" />
                          <div>
                            <span className="font-bold text-white group-hover:text-[#E6C587]">{p.title}</span>
                            <span className="text-slate-400 ml-2 text-[10px] bg-[#161923] px-1.5 py-0.5 rounded border border-[#2E3548]">{p.category}</span>
                          </div>
                        </div>
                        <span className="font-mono text-white font-bold">৳{p.price}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Merchants Section */}
                {filteredMerchants.length > 0 && (
                  <div className="p-2">
                    <div className="px-2 py-1 font-bold text-slate-400 uppercase text-[10px]">Registered Stores ({filteredMerchants.length})</div>
                    {filteredMerchants.slice(0, 3).map((m: any) => (
                      <button
                        key={m.storeSlug}
                        onClick={() => {
                          setSearchQuery('');
                          if (onNavigateTab) onNavigateTab('settings');
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-[#252B3B] rounded-xl flex items-center justify-between text-slate-200 transition cursor-pointer group"
                      >
                        <div className="flex items-center gap-2">
                          <Globe className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <div>
                            <span className="font-bold text-white group-hover:text-[#E6C587]">{m?.storeName || 'Store'}</span>
                            <span className="text-slate-400 ml-2 text-[10px]">({m?.ownerName} - {m?.email})</span>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono text-[#E6C587] bg-[#D4AF37]/10 px-2 py-0.5 rounded border border-[#D4AF37]/20">store.zid.sa/{m?.storeSlug}</span>
                      </button>
                    ))}
                  </div>
                )}

                {filteredOrders.length === 0 && filteredProducts.length === 0 && filteredMerchants.length === 0 && (
                  <div className="p-6 text-center text-slate-400 space-y-1">
                    <Search className="w-6 h-6 text-slate-600 mx-auto" />
                    <p>No results found matching "<span className="text-white font-bold">{searchQuery}</span>"</p>
                    <p className="text-[10px] text-slate-500">Try searching order ID, customer name, product title or store name.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Action Icons: Zid AI, Notifications, Dark/Light Mode, Currency, Storefront & Profile */}
        <div className="flex items-center justify-end gap-2 sm:gap-2.5 flex-wrap">
          {/* Zid AI Assistant Icon Button */}
          <button
            onClick={() => setShowAiModal(true)}
            className="flex items-center gap-1.5 bg-gradient-to-r from-indigo-600/30 via-purple-600/30 to-[#D4AF37]/20 hover:from-indigo-600/40 hover:to-[#D4AF37]/30 text-slate-100 text-xs font-semibold px-3 py-2 rounded-xl border border-indigo-500/40 transition cursor-pointer shadow-sm group"
            title="Open Zid AI Assistant"
          >
            <Bot className="w-4 h-4 text-[#E6C587] group-hover:rotate-12 transition-transform" />
            <span className="font-bold text-white">Zid AI</span>
            <Sparkles className="w-3 h-3 text-indigo-400 fill-indigo-400" />
          </button>

          {/* Mobile Search Button */}
          <button
            onClick={() => setIsMobileSearchOpen(true)}
            className="md:hidden p-2 text-slate-300 hover:text-white bg-[#252B3B] hover:bg-[#2E3548] rounded-xl border border-[#3A435E] transition cursor-pointer"
            title="Search Store"
          >
            <Search className="w-4 h-4 text-[#E6C587]" />
          </button>

          {/* Notifications Button */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-2 text-slate-300 hover:text-white bg-[#252B3B] hover:bg-[#2E3548] rounded-xl border border-[#3A435E] relative transition cursor-pointer"
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#D4AF37] rounded-full border-2 border-[#1D212E]" />
            </button>

            {/* Notifications Dropdown */}
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-72 bg-[#1D212E] border border-[#2E3548] rounded-2xl shadow-2xl p-3 z-50 text-xs">
                <div className="flex justify-between items-center pb-2 border-b border-[#2E3548] mb-2">
                  <span className="font-bold text-white">Notifications</span>
                  <span className="text-[10px] text-[#E6C587] bg-[#D4AF37]/10 px-2 py-0.5 rounded font-semibold">2 New</span>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {notificationsList.map(n => (
                    <div key={n.id} className="p-2 bg-[#181B26] rounded-xl border border-[#2E3548] text-left">
                      <div className="flex justify-between font-semibold text-slate-200">
                        <span>{n.title}</span>
                        <span className="text-[10px] text-slate-400">{n.time}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">{n.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Dark / Light Mode Toggle Switch */}
          <button
            onClick={onToggleTheme}
            className={`p-2 rounded-xl border transition cursor-pointer ${
              isDarkMode
                ? 'text-slate-300 hover:text-white bg-[#252B3B] hover:bg-[#2E3548] border-[#3A435E]'
                : 'text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border-slate-300'
            }`}
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
          </button>

          {/* Currency Toggle */}
          <button
            onClick={onToggleCurrency}
            className="hidden sm:flex items-center gap-1 bg-[#252B3B] hover:bg-[#2E3548] text-slate-300 text-xs font-semibold px-2.5 py-2 rounded-xl border border-[#3A435E] transition cursor-pointer"
            title="Toggle Dashboard Currency View"
          >
            <Globe className="w-3.5 h-3.5 text-[#E6C587]" />
            <span className="text-[#E6C587] font-bold">{merchant?.currency || 'BDT'} ({merchant?.currency === 'USD' ? '$' : '৳'})</span>
          </button>

          {/* Storefront Preview */}
          <button
            onClick={onOpenStorefrontPreview}
            className="flex items-center gap-1 bg-[#252B3B] hover:bg-[#2E3548] text-slate-200 text-xs font-semibold px-2.5 py-2 rounded-xl border border-[#3A435E] transition cursor-pointer"
            title="Preview Live Merchant Storefront"
          >
            <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden lg:inline">Live Store</span>
          </button>

          {/* Merchant Profile Pill */}
          <div className="flex items-center gap-2.5 pl-2.5 border-l border-[#2E3548]">
            <div className="w-8 h-8 rounded-xl bg-[#252B3B] border border-[#3A435E] flex items-center justify-center text-slate-200 font-bold text-xs shrink-0 overflow-hidden shadow-sm">
              {merchant?.logoUrl ? (
                <SafeImage src={merchant.logoUrl} alt={merchant?.storeName || 'Store'} className="w-full h-full object-cover" />
              ) : (
                (merchant?.storeName || 'S').charAt(0).toUpperCase()
              )}
            </div>
            <div className="hidden xl:block text-left">
              <div className="text-xs font-bold text-white leading-tight">{merchant?.storeName || 'My Store'}</div>
              <div className="flex items-center gap-2">
                <a
                  href={`https://zidbdsaas2026.vercel.app/e/${merchant?.storeSlug || ''}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-[#E6C587] font-mono leading-tight hover:underline cursor-pointer"
                >
                  zidbdsaas2026.vercel.app/e/{merchant?.storeSlug || ''}
                </a>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    navigator.clipboard.writeText(`https://zidbdsaas2026.vercel.app/e/${merchant?.storeSlug || ''}`);
                    alert('Store link copied to clipboard!');
                  }}
                  className="p-0.5 text-slate-500 hover:text-white transition-colors"
                  title="Copy Store Link"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            </div>

            <button
              onClick={onLogout}
              className="p-1.5 text-slate-400 hover:text-red-400 bg-[#252B3B] hover:bg-red-500/10 rounded-xl border border-[#3A435E] hover:border-red-500/30 transition cursor-pointer ml-0.5"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Zid AI Assistant Drawer / Modal */}
      {showAiModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#1D212E] border border-[#2E3548] w-full max-w-lg rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh]">
            <div className="p-4 border-b border-[#2E3548] bg-gradient-to-r from-[#202533] to-[#282D3F] flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#D4AF37]/20 text-[#E6C587] flex items-center justify-center">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm flex items-center gap-1.5">
                    Zid AI Assistant
                    <span className="text-[10px] text-[#E6C587] bg-[#D4AF37]/10 px-2 py-0.5 rounded border border-[#D4AF37]/20 font-mono">GPT-4o</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">Merchant Growth & Sales Copilot</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (confirm('Are you sure you want to clear the entire chat history?')) {
                      setAiResponses([{
                        sender: 'ai',
                        text: `Marhaba! I am Zid AI Assistant. How can I help boost sales for ${merchant?.storeName || 'your store'} today? I can help optimize product titles, write marketing WhatsApp copy, or check bKash settlements.`
                      }]);
                    }
                  }}
                  className="text-slate-400 hover:text-red-400 p-1.5 rounded-lg hover:bg-[#2E3548] transition-colors"
                  title="Clear Chat"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowAiModal(false)}
                  className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-[#2E3548] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-3 max-h-[350px] min-h-[300px] bg-[#181B26] custom-scrollbar">
              {aiResponses.map((res, i) => (
                <div
                  key={i}
                  className={`flex ${res.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed ${
                    res.sender === 'user'
                      ? 'bg-gradient-to-r from-[#BF953F] via-[#FCF6BA] to-[#B38728] text-slate-950 font-medium rounded-tr-none'
                      : 'bg-[#202533] text-slate-200 border border-[#2E3548] rounded-tl-none whitespace-pre-line'
                  }`}>
                    {res.text}
                  </div>
                </div>
              ))}
            </div>

            <div className="px-3 py-2 bg-[#1D212E] border-t border-[#2E3548]">
              <div className="flex flex-wrap gap-2 mb-2 overflow-x-auto no-scrollbar pb-1">
                {[
                  { icon: '✨', label: 'Write Product Description', prompt: 'Write a compelling product description for my latest item.' },
                  { icon: '📲', label: 'WhatsApp Sales Copy', prompt: 'Create a short WhatsApp marketing message for my current store sales.' },
                  { icon: '📊', label: 'Check bKash Tips', prompt: 'Give me tips to increase my bKash payment conversion rate.' }
                ].map((chip, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setAiPrompt(chip.prompt);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#252B3B] border border-[#3A435E] hover:border-[#D4AF37]/50 text-[10px] font-bold text-slate-300 hover:text-white transition-all cursor-pointer whitespace-nowrap"
                  >
                    <span>{chip.icon}</span>
                    <span>{chip.label}</span>
                  </button>
                ))}
              </div>

              <form onSubmit={handleAiSend} className="flex gap-2">
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Ask Zid AI (e.g. 'How to increase bKash conversions?')"
                  className="flex-1 bg-[#181B26] text-xs text-white px-3 py-2.5 rounded-xl border border-[#2E3548] focus:border-[#D4AF37] focus:outline-none"
                />
                <button
                  type="submit"
                  className="bg-gradient-to-r from-[#BF953F] via-[#FCF6BA] to-[#B38728] hover:from-[#FCF6BA] hover:to-[#BF953F] text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Ask</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Full-Screen Search Modal */}
      {isMobileSearchOpen && (
        <div className="fixed inset-0 bg-[#141721] z-50 flex flex-col p-4 overflow-y-auto">
          <div className="flex items-center justify-between pb-3 border-b border-[#2E3548]">
            <div className="flex items-center gap-2 flex-1">
              <Search className="w-5 h-5 text-[#E6C587]" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search orders, products, customers..."
                className="w-full bg-transparent text-sm text-white font-medium focus:outline-none placeholder:text-slate-500"
              />
            </div>
            <button
              onClick={() => {
                setIsMobileSearchOpen(false);
                setSearchQuery('');
              }}
              className="p-2 text-slate-400 hover:text-white bg-[#252B3B] rounded-xl border border-[#3A435E]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-4 space-y-4 flex-1 pb-10">
            {searchQuery.trim().length === 0 ? (
              <div className="text-center py-12 text-slate-500 space-y-2">
                <Search className="w-10 h-10 text-slate-600 mx-auto opacity-50" />
                <p className="text-sm font-semibold text-slate-300">Type to search store data</p>
                <p className="text-xs text-slate-500">Search by Order ID, Customer Name, Product Title, SKU, or Store Name.</p>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                {/* Orders */}
                {filteredOrders.length > 0 && (
                  <div>
                    <div className="font-bold text-slate-400 uppercase text-[10px] mb-2 px-1">Orders ({filteredOrders.length})</div>
                    <div className="space-y-1.5">
                      {filteredOrders.map((o: any) => (
                        <button
                          key={o.id}
                          onClick={() => {
                            setIsMobileSearchOpen(false);
                            setSearchQuery('');
                            if (onNavigateTab) onNavigateTab('orders');
                          }}
                          className="w-full text-left bg-[#1D212E] p-3 rounded-xl border border-[#2E3548] flex items-center justify-between text-slate-200 active:bg-[#252B3B]"
                        >
                          <div>
                            <span className="font-bold text-white text-sm">{o.id}</span>
                            <div className="text-slate-400 text-xs mt-0.5">{o.customerName} ({o.customerPhone})</div>
                          </div>
                          <span className="font-mono text-[#E6C587] font-bold text-sm">৳{o.totalAmount}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Products */}
                {filteredProducts.length > 0 && (
                  <div>
                    <div className="font-bold text-slate-400 uppercase text-[10px] mb-2 px-1">Products ({filteredProducts.length})</div>
                    <div className="space-y-1.5">
                      {filteredProducts.map((p: any) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setIsMobileSearchOpen(false);
                            setSearchQuery('');
                            if (onNavigateTab) onNavigateTab('products');
                          }}
                          className="w-full text-left bg-[#1D212E] p-3 rounded-xl border border-[#2E3548] flex items-center justify-between text-slate-200 active:bg-[#252B3B]"
                        >
                          <div>
                            <span className="font-bold text-white text-sm">{p.title}</span>
                            <div className="text-slate-400 text-xs mt-0.5">Category: {p.category} | SKU: {p.sku || 'N/A'}</div>
                          </div>
                          <span className="font-mono text-[#E6C587] font-bold text-sm">৳{p.price}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Merchants */}
                {filteredMerchants.length > 0 && (
                  <div>
                    <div className="font-bold text-slate-400 uppercase text-[10px] mb-2 px-1">Stores ({filteredMerchants.length})</div>
                    <div className="space-y-1.5">
                      {filteredMerchants.map((m: any) => (
                        <button
                          key={m.storeSlug}
                          onClick={() => {
                            setIsMobileSearchOpen(false);
                            setSearchQuery('');
                            if (onNavigateTab) onNavigateTab('settings');
                          }}
                          className="w-full text-left bg-[#1D212E] p-3 rounded-xl border border-[#2E3548] flex items-center justify-between text-slate-200 active:bg-[#252B3B]"
                        >
                          <div>
                            <span className="font-bold text-white text-sm">{m?.storeName || 'Store'}</span>
                            <div className="text-slate-400 text-xs mt-0.5">Owner: {m?.ownerName} ({m?.email})</div>
                          </div>
                          <span className="text-[10px] font-mono text-[#E6C587] bg-[#D4AF37]/10 px-2 py-1 rounded font-bold">store.zid.sa/{m?.storeSlug}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {filteredOrders.length === 0 && filteredProducts.length === 0 && filteredMerchants.length === 0 && (
                  <div className="text-center py-12 text-slate-400 space-y-2">
                    <Search className="w-8 h-8 text-slate-600 mx-auto" />
                    <p className="text-sm">No results found matching "<span className="text-white font-bold">{searchQuery}</span>"</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

