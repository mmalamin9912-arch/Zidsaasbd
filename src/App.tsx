import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { NavigationTab, ProductSubTab, CustomerSubTab, StoreSubTab, SettingsSubTab, MerchantProfile, BankAccount, MobileBankingConfig, CodConfig, PaymentGatewayConfig, CourierService, Order, Product, Customer, AdminPaymentGatewayConfig, SubscriptionRequest, ThemeConfig, ThemePurchaseRequest, SubscriptionPlan, PlatformTheme, SupportTicket, PlatformAddon, AuditLog, PlatformSecuritySettings, BroadcastMessage, PlatformAutomationSettings, AdminTeamMember, AdminRolePermission } from './types';

import {
  initialMerchant,
  initialAllMerchants,
  initialBankAccounts,
  initialMobileBanking,
  initialCodConfig,
  initialPaymentGateway,
  initialCouriers,
  initialOrders,
  initialCustomers,
  subscriptionPlans,
  initialThemes,
  initialPlatformSettings,
  initialPlatformAnnouncement,
  initialPendingSubscriptions,
  initialThemePurchaseRequests,
  initialSupportTickets,
  initialPlatformAddons,
  initialAuditLogs,
  initialSecuritySettings,
  initialBroadcastHistory,
  initialAutomationSettings,
  initialAdminTeam,
  initialRolePermissions
} from './data/initialData';

import { PublicPricingLanding } from './components/PublicPricingLanding';
import { PublicCheckout } from './PublicCheckout';
import { AuthFlow } from './components/AuthFlow';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { SubscriptionModal } from './components/SubscriptionModal';
import { StorefrontPreviewModal } from './components/StorefrontPreviewModal';
import { TenantStorefrontView } from './components/TenantStorefrontView';
import { SuperAdminPortalView } from './components/SuperAdminPortalView';
import { safeSetItem, safeGetItem, safeRemoveItem } from './utils/safeStorage';
import { normalizeOrders } from './utils/orderUtils';
import { isStoreCode, isUuid } from './lib/storeId';
import { resolveLayoutForTheme } from './lib/themeRegistry';
import {
  fetchPlatformConfig,
  savePlatformConfig,
  fetchSecuritySettings,
  saveSecuritySettings,
  fetchAuditLogs,
  appendAuditLog,
  clearAuditLogs,
} from './lib/platformConfigApi';
import {
  fetchSupportTickets,
  saveSupportTicket,
  fetchBroadcastHistory,
  saveBroadcast,
  fetchAnnouncement,
  saveAnnouncement,
} from './lib/supportCommsApi';
import {
  fetchAdminTeam,
  saveAdminMember,
  deleteAdminMember,
  fetchRolePermissions,
  saveRolePermissions,
} from './lib/adminTeamApi';
import { fetchPlans, ensurePlansSeeded, savePlan, deletePlan } from './lib/plansApi';
import {
  subscribeToSubscriptionStatus,
  primeSubscriptionStatus,
  type SubscriptionStatusSnapshot,
} from './lib/subscriptionStatusCache';

import { DashboardView } from './components/views/DashboardView';
import { PaymentsView } from './components/views/PaymentsView';
import { LogisticsView } from './components/views/LogisticsView';
import { BillingView } from './components/views/BillingView';
import { OrdersView } from './components/views/OrdersView';
import { ProductsView } from './components/views/ProductsView';
import { CustomersView } from './components/views/CustomersView';
import { supabase } from './lib/supabase';
import { MarketingView } from './components/views/MarketingView';
import { AppsWhatsAppView } from './components/views/AppsWhatsAppView';
import { OnlineStoreView } from './components/views/OnlineStoreView';
import { AnalyticsView } from './components/views/AnalyticsView';
import { FinancingView } from './components/views/FinancingView';
import { GrowthView } from './components/views/GrowthView';
import { ChannelsView } from './components/views/ChannelsView';
import { SettingsView } from './components/views/SettingsView';

import { calculatePlanTimestamps, getPlanDurationInDays } from './utils/subscriptionUtils';
import {
  resolveMerchantSubscription,
  fetchMerchantSubscriptionFromSupabase,
  syncMerchantSubscription,
  subscribeToMerchantSubscription
} from './lib/subscriptionService';
import { Menu, ShieldAlert, Clock, ArrowUpRight } from 'lucide-react';

/**
 * Reserved first-path-segments that are application routes, not store refs.
 * Anything else at the root is treated as a store reference.
 */
const RESERVED_ROOT_SEGMENTS = new Set([
  'admin', 'super-admin', 'admin-login', 'super-admin-gateway',
  'dashboard', 'store', 'e', 'pricing', 'landing', 'login', 'signin',
  'register', 'signup', 'checkout', 'api', 'assets', 'static',
]);

/**
 * Is this path a bare store reference like `/ZID-BD-5150` or `/dhaka-threads`?
 *
 * These arrive from shared storefront links. They are NOT app routes, so
 * without explicit handling they matched nothing and the platform served its
 * 404 HTML page — the "The page could not be found" (NOT_FOUND) error. Only a
 * single non-reserved segment qualifies, so real routes are never hijacked.
 */
function isBareStorePath(path: string): boolean {
  const segments = String(path || '').split('?')[0].split('/').filter(Boolean);
  if (segments.length !== 1) return false;

  const segment: string = decodeURIComponent(segments[0]).split(':')[0].trim();
  if (!segment) return false;

  // A permanent ZID-BD-XXXX code or a stores.id UUID is unambiguously a store.
  const isCodeOrUuid: boolean = isStoreCode(segment) || isUuid(segment);
  if (isCodeOrUuid) return true;

  // Otherwise it must look like a slug (no dots) and not be a reserved route.
  if (segment.includes('.')) return false;
  return !RESERVED_ROOT_SEGMENTS.has(segment.toLowerCase());
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavigationTab>('dashboard');
  const [productSubTab, setProductSubTab] = useState<ProductSubTab>('all_products');
  const [customerSubTab, setCustomerSubTab] = useState<CustomerSubTab>('all_customers');
  const [storeSubTab, setStoreSubTab] = useState<StoreSubTab>('themes');
  // Selected Settings sub-tab. Lifted here so the sidebar's "Checkout page
  // options" entry actually opens that panel instead of leaving SettingsView on
  // its own default sub-tab.
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTab>('settings_general');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isPremiumPlan, setIsPremiumPlan] = useState<boolean>(false); // Placeholder for testing premium features
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('zid_theme_mode');
      return saved !== null ? JSON.parse(saved) : true;
    } catch (e) {
      return true;
    }
  });

  const handleToggleTheme = () => {
    const nextMode = !isDarkMode;
    setIsDarkMode(nextMode);
    try {
      localStorage.setItem('zid_theme_mode', JSON.stringify(nextMode));
    } catch (e) {
      console.error(e);
    }
  };

  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      const path = window.location.pathname;
      if (path === '/' || path === '' || path === '/pricing' || path === '/landing') {
        return false;
      }
      const savedSession = localStorage.getItem('zid_auth_session');
      return !!savedSession;
    } catch (e) {
      return false;
    }
  });

  // App Master States
  const [showLanding, setShowLanding] = useState<boolean>(() => {
    const path = window.location.pathname;
    if (path === '/' || path === '' || path === '/pricing' || path === '/landing') {
      return true;
    }
    const savedSession = localStorage.getItem('zid_auth_session');
    return !savedSession;
  });
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup');
  const [preAuthCheckoutPlan, setPreAuthCheckoutPlan] = useState<string | null>(null);

  const [currentPath, setCurrentPath] = useState<string>(() => window.location.pathname);

  React.useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  React.useEffect(() => {
    // Auth State Detection on Load & Strict Root Landing Page Routing
    const checkAuthAndRoute = () => {
      const path = window.location.pathname;
      if (path === '/admin' || path === '/super-admin' || path === '/admin-login' || path === '/super-admin-gateway') {
        const adminSession = sessionStorage.getItem('zid_super_admin_auth');
        if (adminSession === 'true') {
          setIsAdminAuthenticated(true);
        }
        return;
      }

      if (path.startsWith('/store/') || path.startsWith('/e/')) {
        return;
      }

      // A bare store reference — `/ZID-BD-5150`, `/dhaka-threads` — is a
      // storefront link, NOT an app route. Without this branch the path matched
      // nothing, so the edge fell through to the platform's 404 HTML page
      // ("The page could not be found"). We rewrite it to the real storefront
      // route (which resolves slug/code/UUID via the store API) so the URL
      // always lands on a page that exists.
      if (isBareStorePath(path)) {
        const ref = path.replace(/^\/+/, '');
        const target = `/store/${ref}`;
        window.history.replaceState({}, '', target);
        setCurrentPath(target);
        setShowLanding(false);
        return;
      }

      const session = localStorage.getItem('zid_auth_session');

      // Root path (/) must show the Landing Page first.
      // Do NOT automatically redirect unauthenticated users or fresh visitors directly to /dashboard.
      if (path === '/' || path === '' || path === '/pricing' || path === '/landing') {
        setShowLanding(true);
        if (!session) {
          setIsAuthenticated(false);
        }
      } else if (path === '/dashboard' || path.startsWith('/dashboard/')) {
        if (session) {
          setIsAuthenticated(true);
          setShowLanding(false);
          setActiveTab('dashboard');
        } else {
          // Unauthenticated user trying to access /dashboard directly
          setIsAuthenticated(false);
          setShowLanding(true);
          window.history.replaceState({}, '', '/');
          setCurrentPath('/');
        }
      } else if (path === '/register' || path === '/signup') {
        setShowLanding(false);
        setAuthMode('signup');
      } else if (path === '/login' || path === '/signin') {
        setShowLanding(false);
        setAuthMode('login');
      }
    };
    checkAuthAndRoute();
  }, []);

  const sanitizeMerchantProfile = (raw: any): MerchantProfile => {
    return resolveMerchantSubscription(raw);
  };

  const [merchant, setMerchant] = useState<MerchantProfile>(() => {
    try {
      const savedSession = localStorage.getItem('zid_auth_session');
      if (savedSession) {
        const parsed = JSON.parse(savedSession);
        if (parsed?.userProfile) return resolveMerchantSubscription(parsed.userProfile);
      }
      const saved = localStorage.getItem('ZID_MERCHANT_STORE_DATA');
      if (saved) {
        const storeMerchant = JSON.parse(saved).merchant;
        if (storeMerchant) return resolveMerchantSubscription(storeMerchant);
      }
    } catch (e) {
      console.error(e);
    }
    return resolveMerchantSubscription(initialMerchant);
  });
  const [authLoading, setAuthLoading] = useState(true);

  // Supabase Auth listener
  React.useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setIsAuthenticated(true);
        fetchMerchantProfile(session.user.id, session.user.email);
      } else {
        setAuthLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setIsAuthenticated(true);
        fetchMerchantProfile(session.user.id, session.user.email);
      } else {
        setAuthLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchMerchantProfile = async (userId: string, userEmail?: string) => {
    try {
      let resolved: MerchantProfile | null = null;

      if (userEmail) {
        try {
          const res = await fetch(`/api/stores/check/${encodeURIComponent(userEmail)}`);
          const data = await res.json().catch(() => null);
          if (data?.merchant) {
            resolved = resolveMerchantSubscription(data.merchant);
          }
        } catch (e) {
          console.warn('[App] MongoDB store check notice:', e);
        }
      }

      if (!resolved && (userId || userEmail)) {
        resolved = await fetchMerchantSubscriptionFromSupabase({ userId, email: userEmail });
      }

      if (resolved) {
        const slug = resolved.storeSlug || (resolved.storeName ? resolved.storeName.toLowerCase().replace(/[^a-z0-9]/g, '') : 'store');
        setMerchant(resolved);

        if (slug && (window.location.pathname === '/' || window.location.pathname.startsWith('/dashboard'))) {
          window.history.replaceState({}, '', `/dashboard/${slug}`);
          setCurrentPath(`/dashboard/${slug}`);
        }
      }
    } catch (e) {
      console.error('Error fetching merchant profile:', e);
    } finally {
      setAuthLoading(false);
    }
  };

  // ── MongoDB-authoritative subscription status ──────────────────────────────
  //
  // `merchant.subscriptionPlan` is a LOCAL profile field and can be stale: a
  // store whose admin approval was written to MongoDB may still carry
  // `free_trial` in localStorage/its Supabase mirror, which made the app shell
  // render the trial countdown on top of an already-ACTIVE paid plan.
  //
  // `/api/subscription/status` resolves `subscription_status` from every spelling
  // an admin write may have used (see lib/serverApp.ts), so it is the ONE value
  // we branch on here. Until it answers we keep it `null` and fall back to the
  // local profile, so a first paint never flashes the trial bar incorrectly.
  const [dbSubscriptionStatus, setDbSubscriptionStatus] = useState<string | null>(null);
  const [dbSubscriptionSnapshot, setDbSubscriptionSnapshot] = useState<SubscriptionStatusSnapshot | null>(null);

  // Prime the shared cache from the local profile BEFORE subscribing, so a store
  // that is already on a paid plan paints "Pro" on the very first frame. Without
  // this the shell renders one locked frame, then flips to unlocked a moment
  // later — the "UNLOCKED" badge flicker.
  useMemo(() => {
    primeSubscriptionStatus(merchant?.email, merchant?.storeSlug || merchant?.storeName, merchant);
  }, [merchant?.subscriptionPlan, merchant?.subscription_status]);

  React.useEffect(() => {
    const email = (merchant?.email || '').trim();
    const slug = (merchant?.storeSlug || merchant?.storeName || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    if (!email && !slug) return;

    // ONE shared subscription per identity. The cache dedupes the request,
    // serves the primed/cached value synchronously (no locked first frame) and
    // owns a single background timer instead of a per-component `setInterval`.
    return subscribeToSubscriptionStatus(email, slug, (snapshot) => {
      setDbSubscriptionSnapshot(snapshot);
      if (snapshot.status) setDbSubscriptionStatus(snapshot.status);
    });
  }, [merchant?.email, merchant?.storeSlug, merchant?.storeName]);

  // Trial & Subscription Logic
  //
  // `isPaidPlan` is the single source of truth for "this store is on a paid
  // plan", and it consults the DB status FIRST. Any one of these is sufficient:
  //   1. MongoDB `subscription_status === 'ACTIVE'` (what an admin approval writes).
  //   2. A paid plan id on the resolved merchant profile.
  const dbReportsActive = (dbSubscriptionStatus || '').toUpperCase() === 'ACTIVE';
  const localPlanId = merchant?.subscriptionPlan;
  const hasPaidPlanId = !!localPlanId && localPlanId !== 'free_trial' && localPlanId !== 'trial';
  const isPaidPlan = dbReportsActive || hasPaidPlanId;
  const trialEndsAtDate = merchant?.trialEndsAt ? new Date(merchant.trialEndsAt) : null;
  const now = new Date();
  const trialDaysRemaining = trialEndsAtDate
    ? Math.max(0, Math.ceil((trialEndsAtDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : (merchant?.trialDaysRemaining ?? 0);
  const isTrialExpired = !isPaidPlan && trialDaysRemaining <= 0;
  // Shown ONLY for a strict trial account: no DB-confirmed ACTIVE plan and no
  // paid plan id. Never alongside an active paid plan.
  const isTrialActive = !isPaidPlan && trialDaysRemaining > 0;

  const prevSlugRef = React.useRef<string>(merchant?.storeSlug || '');
  // Stable identity key for the data-load effect. We only want to re-fetch when
  // the PERMANENT store identity changes — NOT when `setMerchant`/`setProducts`
  // (called inside this very effect) mutate the merchant object. Without this
  // guard, the effect re-runs on every state update it triggers, producing the
  // 300+ request infinite fetch loop.
  const storeIdentityKey = React.useRef<string>('');
  const pendingIdentity = [merchant?.id, merchant?.storeCode, merchant?.storeSlug, activeTab].join('|');

  // Fetch data from DB on mount, storeSlug change, or tab switch.
  // Data loads are keyed on the PERMANENT store identity (UUID / store_code);
  // the slug is only a fallback, so renaming a store never breaks lookups.
  React.useEffect(() => {
    // Skip re-run if the permanent identity + active tab haven't changed.
    // This breaks the loop: setMerchant()/setProducts() inside this effect
    // change `merchant`, but the identity key stays the same.
    if (storeIdentityKey.current === pendingIdentity) return;
    storeIdentityKey.current = pendingIdentity;

    const merchantId = merchant?.id || merchant?.storeCode || merchant?.storeSlug || 'default';
    const storeSlug = merchant?.storeSlug || merchant?.id || 'default';
    let isMounted = true;

    // Safe helper to fetch JSON
    const safeFetch = async (url: string) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const contentType = res.headers.get('content-type') || '';
        if (contentType && !contentType.includes('application/json')) {
          return null;
        }
        const text = await res.text();
        if (!text) return null;
        const trimmed = text.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          return JSON.parse(trimmed);
        }
        return null;
      } catch (err) {
        return null;
      }
    };

    // Products
    const loadAppProducts = async () => {
      try {
        const res = await fetch(`/api/products?store_slug=${encodeURIComponent(storeSlug)}`);
        const data = await res.json().catch(() => null);
        if (isMounted && Array.isArray(data) && data.length > 0) {
          const { mapApiProduct } = await import('./utils/catalogPayload');
          setProducts(data.map((p: any) => mapApiProduct(p)));
          return;
        }
      } catch (err) {
        console.warn('[App] Product load warning:', err);
      }

      safeFetch(`/api/products-by-slug/${encodeURIComponent(storeSlug)}`).then(data => {
        if (isMounted && Array.isArray(data)) {
          if (data.length > 0 || products.length === 0) {
            setProducts(data);
          }
        }
      });
    };
    loadAppProducts();

    // Merchant Settings & Profile by storeSlug
    if (merchant?.storeSlug) {
      safeFetch(`/api/stores/slug/${encodeURIComponent(merchant.storeSlug)}`).then(dbMerchant => {
        if (isMounted && dbMerchant) {
          setMerchant(prev => ({
            ...prev,
            ...dbMerchant,
            themeConfig: dbMerchant.themeConfig || dbMerchant.theme_config || prev.themeConfig,
          }));
        }
      });
    }

    // Categories — only update merchant state when categories actually
    // changed, otherwise setMerchant re-triggers the auto-sync effect.
    const loadCategories = async () => {
      let catsRes = await safeFetch(`/api/categories?store_slug=${encodeURIComponent(storeSlug)}`);
      let cats = Array.isArray(catsRes) ? catsRes : (Array.isArray(catsRes?.categories) ? catsRes.categories : null);
      if (!Array.isArray(cats) || cats.length === 0) {
        const bySlug = await safeFetch(`/api/categories-by-slug/${encodeURIComponent(storeSlug)}`);
        cats = Array.isArray(bySlug) ? bySlug : (Array.isArray(bySlug?.categories) ? bySlug.categories : []);
      }
      if (isMounted && Array.isArray(cats) && cats.length > 0) {
        setMerchant(prev => {
          const existing = prev?.themeConfig?.categoriesList;
          // Avoid a no-op state update (same reference / same length) that would
          // retrigger downstream effects and the auto-sync loop.
          if (Array.isArray(existing) && existing.length === cats.length) return prev;
          return {
            ...prev,
            themeConfig: {
              ...(prev.themeConfig || {}),
              categoriesList: cats
            }
          };
        });
      }
    };
    loadCategories();

    // Customers
    safeFetch(`/api/customers/${merchantId}`).then(data => {
      if (isMounted && Array.isArray(data) && data.length > 0) {
        setCustomers(data);
      }
    });

    // Orders — query via the flexible collection endpoint so the server can
    // match on store_id OR store_slug OR merchant_id. Passing BOTH the merchant
    // id and the slug means a checkout that only knew the slug is still found.
    const ordersQuery = new URLSearchParams();
    if (merchant?.id) ordersQuery.set('merchant_id', String(merchant.id));
    if (merchant?.storeSlug) ordersQuery.set('store_slug', String(merchant.storeSlug));
    if (!merchant?.id && !merchant?.storeSlug && merchantId) ordersQuery.set('storeRef', String(merchantId));
    safeFetch(`/api/orders${ordersQuery.toString() ? `?${ordersQuery.toString()}` : ''}`).then(data => {
      if (isMounted && Array.isArray(data)) {
        // API rows are raw Mongo documents (total_price / created_at / items as
        // a JSON string). Normalize them into the UI `Order` shape so the
        // dashboard never renders `.toLocaleString()` on an undefined field.
        setOrders(normalizeOrders(data));
      }
    });

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingIdentity]);

  // Auto-sync merchant settings and categories to Supabase on change.
  // Skip the very first run (initial hydration) and only sync when a field we
  // actually persist has changed — otherwise every setMerchant() (including the
  // categories/realtime loads above) fires a POST and re-triggers the loop.
  const merchantSyncRef = React.useRef<boolean>(false);
  React.useEffect(() => {
    if (!merchant || !merchant.storeSlug) return;
    // Skip initial mount; only sync on subsequent real edits.
    if (!merchantSyncRef.current) {
      merchantSyncRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      fetch('/api/stores/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merchant)
      }).catch(err => console.warn('Merchant auto-sync warning:', err));
    }, 1200);
    return () => clearTimeout(timer);
  }, [merchant]);

  // Realtime Supabase Subscription Listener & Live Status Sync
  React.useEffect(() => {
    if (!merchant) return;
    let isMounted = true;

    // The MongoDB-backed subscription cache owns the session status read.
    // Do not repeat a profile/subscription fetch here; this effect is only
    // responsible for the live realtime channel and explicit plan updates.

    // Connect native Supabase Realtime channel for postgres_changes
    const unsubscribe = subscribeToMerchantSubscription(merchant, (updatedMerchant, source) => {
      if (!isMounted) return;
      console.log(`[App Realtime] Active subscription updated from ${source}:`, updatedMerchant.subscriptionPlan);
      setMerchant(prev => ({
        ...prev,
        ...updatedMerchant
      }));
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [merchant?.email, merchant?.storeSlug, merchant?.id]);

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(() => {
    try {
      const saved = localStorage.getItem('ZID_MERCHANT_STORE_DATA');
      if (saved) {
        const parsed = JSON.parse(saved);
        const accounts: BankAccount[] = parsed.bankAccounts || [];
        return accounts.filter(acc => acc.accountNumber !== '210.120.9876543' && acc.accountNumber !== '101235008912');
      }
    } catch (e) {
      console.error(e);
    }
    return initialBankAccounts;
  });

  const [mobileBanking, setMobileBanking] = useState<MobileBankingConfig[]>(() => {
    try {
      const saved = localStorage.getItem('ZID_MERCHANT_STORE_DATA');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.mobileBanking && parsed.mobileBanking.length > 0) {
          const configs: MobileBankingConfig[] = parsed.mobileBanking;
          // Dynamically check and add Rocket if missing
          if (!configs.some((c) => c.provider === 'rocket')) {
            configs.push({
              id: 'mb-rocket',
              provider: 'rocket',
              displayName: 'Rocket Personal / Merchant',
              accountType: 'Personal',
              number: '01911223344',
              isEnabled: false,
              chargePercentage: 1.0,
              instructions: 'Send Money to Rocket Personal (01911223344). Enter your sender Rocket number and Transaction ID in checkout.',
              requireTrxId: true,
              canPayAdvanceCharge: true
            });
          }
          return configs;
        }
      }
    } catch (e) {
      console.error(e);
    }
    return initialMobileBanking;
  });

  const [codConfig, setCodConfig] = useState<CodConfig>(() => {
    try {
      const saved = localStorage.getItem('ZID_MERCHANT_STORE_DATA');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.codConfig) {
          if (parsed.codConfig.insideDhakaFee === 60 && parsed.codConfig.outsideDhakaFee === 120) {
            return initialCodConfig;
          }
          return parsed.codConfig;
        }
      }
    } catch (e) {
      console.error(e);
    }
    return initialCodConfig;
  });

  const [gatewayConfig, setGatewayConfig] = useState<PaymentGatewayConfig>(() => {
    try {
      const saved = localStorage.getItem('ZID_MERCHANT_STORE_DATA');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.gatewayConfig) return parsed.gatewayConfig;
      }
    } catch (e) {
      console.error(e);
    }
    return initialPaymentGateway;
  });

  const [couriers, setCouriers] = useState<CourierService[]>(initialCouriers);
  const [products, setProducts] = useState<Product[]>([]);

  const [customers, setCustomers] = useState<Customer[]>(() => {
    try {
      const saved = localStorage.getItem('ZID_MERCHANT_STORE_DATA');
      if (saved) return JSON.parse(saved).customers || [];
    } catch (e) {
      console.error(e);
    }
    return [];
  });

  const [orders, setOrders] = useState<Order[]>(() => {
    try {
      const saved = localStorage.getItem('ZID_MERCHANT_STORE_DATA');
      if (saved) return JSON.parse(saved).orders || [];
    } catch (e) {
      console.error(e);
    }
    try {
      const saved2 = localStorage.getItem(`ZID_MERCHANT_STORE_DATA_${(merchant as any)?.storeSlug || 'bd'}`);
      if (saved2) return JSON.parse(saved2).orders || [];
    } catch (e) {
      console.error(e);
    }
    return [];
  });

  const [themes, setThemes] = useState<ThemeConfig[]>(() => {
    try {
      const saved = localStorage.getItem('ZID_MERCHANT_STORE_DATA');
      if (saved) return JSON.parse(saved).themes || initialThemes;
    } catch (e) {
      console.error(e);
    }
    return initialThemes;
  });

  React.useEffect(() => {
    try {
      const oldSlug = prevSlugRef.current;
      const newSlug = merchant?.storeSlug || '';

      if (oldSlug && newSlug && oldSlug !== newSlug) {
        // If slug has changed, migrate database data and delete the old entry
        const oldKey = `ZID_MERCHANT_STORE_DATA_${oldSlug}`;
        const newKey = `ZID_MERCHANT_STORE_DATA_${newSlug}`;
        const oldData = safeGetItem(oldKey);
        if (oldData) {
          try {
            const parsed = typeof oldData === 'object' ? oldData : JSON.parse(oldData);
            parsed.merchant = merchant;
            safeSetItem(newKey, parsed);
          } catch (err) {
            safeSetItem(newKey, oldData);
          }
          safeRemoveItem(oldKey);
        }

        // Update the ref to the new slug
        prevSlugRef.current = newSlug;
      }

      const storeData = {
        merchant,
        themes,
        bankAccounts,
        mobileBanking,
        codConfig,
        gatewayConfig
      };
      safeSetItem('ZID_MERCHANT_STORE_DATA', storeData);
      if (merchant?.storeSlug) {
        safeSetItem(`ZID_MERCHANT_STORE_DATA_${merchant.storeSlug}`, storeData);
      }

      // Update the main merchants index (allMerchants) by email to prevent old profile/slug from persisting
      setAllMerchants(prev => {
        // Filter out any other stale entry that might have had the old slug
        const filtered = prev.filter(m => m?.storeSlug !== oldSlug || m?.email === merchant?.email);
        const exists = merchant?.email ? filtered.some(m => m?.email === merchant.email) : false;
        const updated = exists
          ? filtered.map(m => m?.email === merchant?.email ? merchant : m)
          : (merchant ? [...filtered, merchant] : filtered);
        // Do NOT persist the full merchant list to localStorage — it caused QuotaExceededError.
        // Merchants are kept in React state (sourced from MongoDB/initialAllMerchants).
        // Persist only a lightweight index (count + last-updated) so we never bloat
        // localStorage with the full profile list.
        safeSetItem('ZID_ALL_MERCHANTS_INDEX', { lastUpdated: Date.now(), count: updated.length });
        return updated;
      });

      // Synchronize zid_auth_session with updated profile
      const savedSession = safeGetItem('zid_auth_session');
      if (savedSession) {
        try {
          const parsed = typeof savedSession === 'object' ? savedSession : JSON.parse(savedSession);
          parsed.userProfile = merchant;
          safeSetItem('zid_auth_session', parsed);
        } catch (err) {
          console.error(err);
        }
      }

      // Automatically update the storeName in any pending or historical subscription requests for this merchant
      setPendingRequests(prev => {
        const updated = prev.map(req => req?.email === merchant?.email ? { ...req, storeName: merchant?.storeName || 'My Store' } : req);
        safeSetItem('ZID_PENDING_REQUESTS', updated);
        return updated;
      });

    } catch (e) {
      console.error(e);
    }
  }, [merchant, products, themes, bankAccounts, mobileBanking, codConfig, orders, customers]);

  // Super Admin States
  const [adminPaymentConfig, setAdminPaymentConfig] = useState<AdminPaymentGatewayConfig>(() => {
    try {
      const saved = localStorage.getItem('ZID_ADMIN_PAYMENT_CONFIG');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return {
      bkashNumber: '',
      bkashType: 'Personal',
      bkashActive: true,
      nagadNumber: '',
      nagadType: 'Personal',
      nagadActive: true,
      rocketNumber: '',
      rocketType: 'Personal',
      rocketActive: true,
      bankName: '',
      accountName: '',
      accountNumber: '',
      branchName: '',
      routingNumber: '',
      bankActive: true,
      qrTitle: 'Bangla QR',
      qrAccountName: '',
      qrImageUrl: '',
      qrActive: false,
      customGateways: [],
      instructions: 'Send money to our admin accounts and submit your TrxID below for instant verification.',
      enableManualVerification: true
    };
  });

  const [pendingRequests, setPendingRequests] = useState<SubscriptionRequest[]>(() => {
    try {
      const saved = localStorage.getItem('ZID_PENDING_REQUESTS');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return initialPendingSubscriptions;
  });

  const [themePurchaseRequests, setThemePurchaseRequests] = useState<ThemePurchaseRequest[]>(() => {
    try {
      const saved = localStorage.getItem('ZID_THEME_PURCHASE_REQUESTS');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return initialThemePurchaseRequests;
  });

  const [allMerchants, setAllMerchants] = useState<MerchantProfile[]>(() => {
    try {
      const saved = localStorage.getItem('ZID_ALL_MERCHANTS');
      if (saved) {
        const parsed: MerchantProfile[] = JSON.parse(saved);
        // Merge with initialAllMerchants to heal/seed themeConfig if missing or empty
        return parsed.map(m => {
          const initial = initialAllMerchants.find(i => i.email === m.email);
          if (initial) {
            const hasThemeConfig = m.themeConfig && Object.keys(m.themeConfig).length > 0;
            return {
              ...initial,
              ...m,
              themeConfig: hasThemeConfig ? m.themeConfig : initial.themeConfig
            };
          }
          return m;
        });
      }
    } catch (e) {
      console.error(e);
    }
    return initialAllMerchants;
  });

  // Platform Level States
  const [platformSettings, setPlatformSettings] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('ZID_PLATFORM_SETTINGS');
      return saved ? JSON.parse(saved) : initialPlatformSettings;
    } catch (e) {
      return initialPlatformSettings;
    }
  });

  const [platformAnnouncement, setPlatformAnnouncement] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('ZID_PLATFORM_ANNOUNCEMENT');
      return saved ? JSON.parse(saved) : initialPlatformAnnouncement;
    } catch (e) {
      return initialPlatformAnnouncement;
    }
  });

  const [platformPlans, setPlatformPlans] = useState<SubscriptionPlan[]>(() => {
    try {
      const saved = localStorage.getItem('ZID_PLATFORM_PLANS');
      const parsed = saved ? JSON.parse(saved) : null;
      // Force refresh if the number of plans has changed (e.g. from 3 to 4)
      if (parsed && parsed.length === subscriptionPlans.length) {
        return parsed;
      }
      return subscriptionPlans;
    } catch (e) {
      return subscriptionPlans;
    }
  });

  const [platformThemes, setPlatformThemes] = useState<PlatformTheme[]>(() => {
    try {
      const saved = localStorage.getItem('ZID_PLATFORM_THEMES');
      return saved ? JSON.parse(saved) : initialThemes;
    } catch (e) {
      return initialThemes;
    }
  });

  // Load the Super Admin theme catalogue from the DATABASE (Supabase-first,
  // MongoDB fallback via GET /api/admin/themes) so merchant-facing and
  // storefront code reflects the platform's ACTIVE themes without a rebuild.
  // Falls back to the localStorage / initial themes when the API is unreachable.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/themes', { headers: { Accept: 'application/json' }, });
        const data = await res.json().catch(() => null);
        const themes = Array.isArray(data?.themes) ? data.themes : [];
        if (active && themes.length > 0) {
          const normalized: PlatformTheme[] = themes.map((t: any): PlatformTheme => ({
            id: String(t.id || t.slug || ''),
            name: String(t.name || t.title || 'Theme'),
            category: String(t.category || 'General'),
            price: Number(t.priceBDT ?? t.price ?? 0) || 0,
            isFree: t.isFree === true || Number(t.priceBDT ?? t.price ?? 0) === 0,
            previewUrl: String(t.previewUrl || t.preview_url || ''),
            thumbnailUrl: String(t.thumbnailUrl || t.thumbnail_url || ''),
            status: (t.status === 'Hidden' ? 'Hidden' : 'Active'),
            layout: (t.layout || t.template_style || t.template || t.themeLayout) as PlatformTheme['layout'],
          }));
          setPlatformThemes(normalized);
          safeSetItem('ZID_PLATFORM_THEMES', JSON.stringify(normalized));
        }
      } catch (err: any) {
        console.warn('[App] platform themes API notice:', err?.message || err);
      }
    })();
    return () => { active = false; };
  }, []);

  /**
   * Persist the Super Admin theme catalogue to the database AND local state.
   *
   * Every theme in the list is upserted via POST /api/admin/themes (Supabase-
   * first, MongoDB fallback). Deletions are handled by the admin UI calling the
   * DELETE endpoint directly; here we simply mirror the resulting catalogue so
   * merchant-facing/storefront code sees it immediately.
   */
  const handleUpdatePlatformThemes = useCallback((themes: PlatformTheme[]) => {
    setPlatformThemes(themes);
    safeSetItem('ZID_PLATFORM_THEMES', JSON.stringify(themes));
    (async () => {
      for (const theme of themes) {
        try {
          await fetch('/api/admin/themes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // NOTE: `template_style` is a real Supabase column; `layout` is not,
            // so the layout is transported inside `template_style` to avoid a
            // PostgREST "unknown column" rejection. Mongo stores both keys.
            body: JSON.stringify({
              id: theme.id,
              slug: theme.id,
              name: theme.name,
              category: theme.category,
              price: theme.price,
              priceBDT: theme.price,
              isFree: theme.isFree,
              previewUrl: theme.previewUrl,
              preview_url: theme.previewUrl,
              thumbnailUrl: theme.thumbnailUrl,
              thumbnail_url: theme.thumbnailUrl,
              status: theme.status,
              template_style: theme.layout,
              template: theme.layout,
              layout: theme.layout,
            }),
          });
        } catch (err: any) {
          console.warn('[App] platform theme persist notice:', err?.message || err);
        }
      }
    })();
  }, []);

  // ── Load Super Admin platform configuration from the database ────────────────
  // Payment gateways, platform settings (tax / trial / branding / AI), security
  // policy and audit logs are all persisted in Supabase (primary) + MongoDB
  // (fallback). On mount we hydrate local state from the API so every admin sees
  // the shared, dynamic configuration instead of their browser's localStorage.
  React.useEffect(() => {
    let active = true;
    (async () => {
      // 1. Composite platform document (gateways + settings + AI/automation).
      const config = await fetchPlatformConfig();
      if (active && config) {
        if (config.adminPaymentConfig && typeof config.adminPaymentConfig === 'object') {
          setAdminPaymentConfig(prev => ({ ...prev, ...config.adminPaymentConfig }));
        }
        if (config.platformSettings && typeof config.platformSettings === 'object') {
          setPlatformSettings((prev: any) => ({ ...prev, ...config.platformSettings }));
        }
        if (config.automationSettings && typeof config.automationSettings === 'object') {
          setAutomationSettings((prev: any) => ({ ...prev, ...config.automationSettings }));
        }
      }

      if (!active) return;

      // 2. Security policy document.
      const security = await fetchSecuritySettings();
      if (active && security && typeof security === 'object') {
        setPlatformSecuritySettings(prev => ({ ...prev, ...security }));
      }

      if (!active) return;

      // 3. Real-time audit logs.
      const logs = await fetchAuditLogs();
      if (active && logs.length > 0) {
        setAuditLogs(logs);
      }

      if (!active) return;

      // 4. Support & Communication: active merchant tickets. The seed data is
      // only replaced when the database actually has tickets, so a fresh project
      // still renders its demo tickets instead of an empty list.
      const tickets = await fetchSupportTickets();
      if (active && tickets.length > 0) {
        setSupportTickets(tickets);
      }

      if (!active) return;

      // 5. Mass-broadcast delivery history.
      const broadcasts = await fetchBroadcastHistory();
      if (active && broadcasts.length > 0) {
        setBroadcastHistory(broadcasts);
      }

      if (!active) return;

      // 6. Global Notice Banner (shared with every online merchant).
      const announcement = await fetchAnnouncement();
      if (active && announcement && typeof announcement === 'object') {
        setPlatformAnnouncement((prev: any) => ({ ...prev, ...announcement }));
      }

      if (!active) return;

      // 7. Admin team roster. When the database is empty we keep the seeded
      // roster (the single real System Administrator).
      const team = await fetchAdminTeam();
      if (active && team.length > 0) {
        setAdminTeam(team);
      }

      if (!active) return;

      // 8. Role→tab permission matrix.
      const roles = await fetchRolePermissions();
      if (active && roles.length > 0) {
        setRolePermissions(roles);
      }

      if (!active) return;

      // 9. Subscription-plan catalogue. This is the SINGLE source of truth for
      // both the admin configurator and the merchant selection modal, served by
      // the dual-database `/api/subscriptions` endpoint (Supabase → MongoDB).
      // When both stores are empty we auto-seed the default catalogue so the
      // merchant modal always has live, editable plans.
      let dbPlans = await fetchPlans();
      if (dbPlans.length === 0) {
        // Server-side auto-init (creates the collection/table defaults).
        await ensurePlansSeeded();
        dbPlans = await fetchPlans();
      }
      if (active) {
        if (dbPlans.length > 0) {
          setPlatformPlans(dbPlans.filter(p => p.isActive !== false));
        } else {
          // Last-resort local seed (offline / no backend).
          for (const plan of subscriptionPlans) void savePlan(plan);
        }
      }
    })();
    return () => { active = false; };
  }, []);

  // ── One-time cleanup of removed mock data ───────────────────
  // Earlier builds shipped mock support tickets (Dhaka Gadget Hub, Chittagong
  // Fashion House, Sylhet Organic Foods) and mock admin members (Sara Khan,
  // Tanvir Hossain) that a returning browser may still hold in localStorage.
  // Purge those stale records once and delete the members from the database.
  React.useEffect(() => {
    const MOCK_TICKET_IDS = ['ticket-1', 'ticket-2', 'ticket-3'];
    const REMOVED_MEMBER_EMAILS = ['sara.support@zid.com', 'tanvir.finance@zid.com'];
    const REMOVED_MEMBER_IDS = ['adm-2', 'adm-3'];

    try {
      const savedTickets = localStorage.getItem('ZID_SUPPORT_TICKETS');
      if (savedTickets) {
        const parsed = JSON.parse(savedTickets);
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter((t: any) => !MOCK_TICKET_IDS.includes(String(t?.id)));
          localStorage.setItem('ZID_SUPPORT_TICKETS', JSON.stringify(cleaned));
          setSupportTickets(prev => prev.filter(t => !MOCK_TICKET_IDS.includes(String(t?.id))));
        }
      }

      const savedTeam = localStorage.getItem('ZID_ADMIN_TEAM');
      if (savedTeam) {
        const parsed = JSON.parse(savedTeam);
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter(
            (m: any) =>
              !REMOVED_MEMBER_IDS.includes(String(m?.id)) &&
              !REMOVED_MEMBER_EMAILS.includes(String(m?.email || '').toLowerCase())
          );
          localStorage.setItem('ZID_ADMIN_TEAM', JSON.stringify(cleaned));
          setAdminTeam(prev => prev.filter(
            m =>
              !REMOVED_MEMBER_IDS.includes(String(m?.id)) &&
              !REMOVED_MEMBER_EMAILS.includes(String(m?.email || '').toLowerCase())
          ));
        }
      }
    } catch (e) {
      console.warn('[App] mock-data cleanup skipped:', e);
    }

    // Delete the removed members from Supabase/MongoDB (idempotent).
    for (const id of REMOVED_MEMBER_IDS) {
      void deleteAdminMember(id);
    }
  }, []);

  // ── Persist Super Admin platform configuration to the database ──────────────
  // These wrapped setters update local state AND write through to the API
  // (Supabase-first, MongoDB fallback) so a save is durable and shared across
  // admins/devices, not trapped in one browser.

  /** Payment gateways + platform settings + automation, saved as one document. */
  const persistPlatformConfig = useCallback((partial: {
    adminPaymentConfig?: AdminPaymentGatewayConfig;
    platformSettings?: any;
    automationSettings?: any;
  }) => {
    void savePlatformConfig({
      adminPaymentConfig: partial.adminPaymentConfig,
      platformSettings: partial.platformSettings,
      automationSettings: partial.automationSettings,
    });
  }, []);

  // Latest-value refs so the side-effecting persistence runs OUTSIDE the state
  // updater. React (StrictMode) invokes updater functions twice in dev, which
  // would otherwise double-fire every save.
  // (initialised to undefined; reconciled against the real state below, since
  // some of those state hooks are declared further down this component)
  const adminPaymentConfigRef = React.useRef<any>(adminPaymentConfig);
  const platformSettingsRef = React.useRef<any>(platformSettings);
  const automationSettingsRef = React.useRef<any>(undefined);
  const platformSecuritySettingsRef = React.useRef<any>(undefined);
  const auditLogsRef = React.useRef<any>(undefined);
  adminPaymentConfigRef.current = adminPaymentConfig;
  platformSettingsRef.current = platformSettings;

  const handleUpdateAdminPaymentConfig = useCallback((updater: React.SetStateAction<AdminPaymentGatewayConfig>) => {
    const prev = adminPaymentConfigRef.current;
    const next = typeof updater === 'function' ? (updater as (p: AdminPaymentGatewayConfig) => AdminPaymentGatewayConfig)(prev) : updater;
    adminPaymentConfigRef.current = next;
    setAdminPaymentConfig(next);
    persistPlatformConfig({ adminPaymentConfig: next });
  }, [persistPlatformConfig]);

  const handleUpdatePlatformSettings = useCallback((updater: React.SetStateAction<any>) => {
    const prev = platformSettingsRef.current;
    const next = typeof updater === 'function' ? updater(prev) : updater;
    platformSettingsRef.current = next;
    setPlatformSettings(next);
    persistPlatformConfig({ platformSettings: next });
  }, [persistPlatformConfig]);

  const handleUpdateAutomationSettings = useCallback((updater: React.SetStateAction<PlatformAutomationSettings>) => {
    const prev = automationSettingsRef.current;
    const next = typeof updater === 'function' ? (updater as (p: PlatformAutomationSettings) => PlatformAutomationSettings)(prev) : updater;
    automationSettingsRef.current = next;
    setAutomationSettings(next);
    persistPlatformConfig({ automationSettings: next });
  }, [persistPlatformConfig]);

  const handleUpdateSecuritySettings = useCallback((updater: React.SetStateAction<PlatformSecuritySettings>) => {
    const prev = platformSecuritySettingsRef.current;
    const next = typeof updater === 'function' ? (updater as (p: PlatformSecuritySettings) => PlatformSecuritySettings)(prev) : updater;
    platformSecuritySettingsRef.current = next;
    setPlatformSecuritySettings(next);
    void saveSecuritySettings(next);
  }, []);

  const handleUpdateAuditLogs = useCallback((updater: React.SetStateAction<AuditLog[]>) => {
    const prev = auditLogsRef.current;
    const next = typeof updater === 'function' ? (updater as (p: AuditLog[]) => AuditLog[])(prev) : updater;
    auditLogsRef.current = next;
    setAuditLogs(next);
    // Clearing all logs is the only array-replacing operation the UI performs;
    // a full wipe is deleted from BOTH providers. New entries are appended via
    // the dedicated POST route.
    if (Array.isArray(next) && next.length === 0 && prev.length > 0) {
      void clearAuditLogs();
    }
  }, []);

  /** Support tickets: update local state then write the affected ticket(s) to
   *  the database. A full replace (e.g. a bulk refresh) writes every ticket. */
  const supportTicketsRef = React.useRef<SupportTicket[]>([]);
  const handleUpdateSupportTickets = useCallback((updater: React.SetStateAction<SupportTicket[]>) => {
    const prev = supportTicketsRef.current;
    const next = typeof updater === 'function' ? (updater as (p: SupportTicket[]) => SupportTicket[])(prev) : updater;
    supportTicketsRef.current = next;
    setSupportTickets(next);

    // Persist ONLY the tickets that actually changed so a single reply does not
    // re-write the whole list.
    const prevById = new Map(prev.map(t => [t.id, t] as const));
    for (const ticket of next) {
      const before = prevById.get(ticket.id);
      if (!before || before !== ticket) {
        void saveSupportTicket(ticket);
      }
    }
  }, []);

  /** Mass broadcast: append the new record to local state AND the database. */
  const broadcastHistoryRef = React.useRef<BroadcastMessage[]>([]);
  const handleUpdateBroadcastHistory = useCallback((updater: React.SetStateAction<BroadcastMessage[]>) => {
    const prev = broadcastHistoryRef.current;
    const next = typeof updater === 'function' ? (updater as (p: BroadcastMessage[]) => BroadcastMessage[])(prev) : updater;
    broadcastHistoryRef.current = next;
    setBroadcastHistory(next);

    const prevIds = new Set(prev.map(b => b.id));
    for (const broadcast of next) {
      if (!prevIds.has(broadcast.id)) void saveBroadcast(broadcast);
    }
  }, []);

  /** Global Notice Banner: persist so every online merchant sees it in real time. */
  const handleUpdatePlatformAnnouncement = useCallback((announcement: any) => {
    setPlatformAnnouncement(announcement);
    void saveAnnouncement(announcement);
  }, []);

  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>(() => {
    try {
      const saved = localStorage.getItem('ZID_SUPPORT_TICKETS');
      return saved ? JSON.parse(saved) : initialSupportTickets;
    } catch (e) {
      return initialSupportTickets;
    }
  });

  const [platformAddons, setPlatformAddons] = useState<PlatformAddon[]>(() => {
    try {
      const saved = localStorage.getItem('ZID_PLATFORM_ADDONS');
      return saved ? JSON.parse(saved) : initialPlatformAddons;
    } catch (e) {
      return initialPlatformAddons;
    }
  });

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => {
    try {
      const saved = localStorage.getItem('ZID_AUDIT_LOGS');
      return saved ? JSON.parse(saved) : initialAuditLogs;
    } catch (e) {
      return initialAuditLogs;
    }
  });

  const [platformSecuritySettings, setPlatformSecuritySettings] = useState<PlatformSecuritySettings>(() => {
    try {
      const saved = localStorage.getItem('ZID_SECURITY_SETTINGS');
      return saved ? JSON.parse(saved) : initialSecuritySettings;
    } catch (e) {
      return initialSecuritySettings;
    }
  });

  const [broadcastHistory, setBroadcastHistory] = useState<BroadcastMessage[]>(() => {
    try {
      const saved = localStorage.getItem('ZID_BROADCAST_HISTORY');
      return saved ? JSON.parse(saved) : initialBroadcastHistory;
    } catch (e) {
      return initialBroadcastHistory;
    }
  });

  const [automationSettings, setAutomationSettings] = useState<PlatformAutomationSettings>(() => {
    try {
      const saved = localStorage.getItem('ZID_AUTOMATION_SETTINGS');
      return saved ? JSON.parse(saved) : initialAutomationSettings;
    } catch (e) {
      return initialAutomationSettings;
    }
  });

  // Reconcile the persistence refs now that every config state is declared.
  automationSettingsRef.current = automationSettings;
  platformSecuritySettingsRef.current = platformSecuritySettings;
  auditLogsRef.current = auditLogs;
  supportTicketsRef.current = supportTickets;
  broadcastHistoryRef.current = broadcastHistory;

  const [adminTeam, setAdminTeam] = useState<AdminTeamMember[]>(() => {
    try {
      const saved = localStorage.getItem('ZID_ADMIN_TEAM');
      return saved ? JSON.parse(saved) : initialAdminTeam;
    } catch (e) {
      return initialAdminTeam;
    }
  });

  const [rolePermissions, setRolePermissions] = useState<AdminRolePermission[]>(() => {
    try {
      const saved = localStorage.getItem('ZID_ROLE_PERMISSIONS');
      return saved ? JSON.parse(saved) : initialRolePermissions;
    } catch (e) {
      return initialRolePermissions;
    }
  });

  /** Admin team: update local state then write the changed member(s) to the DB. */
  const adminTeamRef = React.useRef<AdminTeamMember[]>([]);
  const handleUpdateAdminTeam = useCallback((updater: React.SetStateAction<AdminTeamMember[]>) => {
    const prev = adminTeamRef.current;
    const next = typeof updater === 'function' ? (updater as (p: AdminTeamMember[]) => AdminTeamMember[])(prev) : updater;
    adminTeamRef.current = next;
    setAdminTeam(next);

    const prevById = new Map(prev.map(m => [m.id, m] as const));
    for (const member of next) {
      const before = prevById.get(member.id);
      if (!before || before !== member) void saveAdminMember(member);
    }
    // Members removed in this update are deleted from the database.
    const nextIds = new Set(next.map(m => m.id));
    for (const member of prev) {
      if (!nextIds.has(member.id)) void deleteAdminMember(member.id);
    }
  }, []);

  /** Role permissions: persist the whole matrix to the DB on every change. */
  const handleUpdateRolePermissions = useCallback((updater: React.SetStateAction<AdminRolePermission[]>) => {
    setRolePermissions(prev => {
      const next = typeof updater === 'function' ? (updater as (p: AdminRolePermission[]) => AdminRolePermission[])(prev) : updater;
      void saveRolePermissions(next);
      return next;
    });
  }, []);

  adminTeamRef.current = adminTeam;

  /**
   * Subscription plans: update local state AND persist the catalogue to the
   * database so merchant-facing plan modals reflect admin price edits live.
   * Each changed plan is upserted; removed plans are deleted from both providers.
   */
  const platformPlansRef = React.useRef<SubscriptionPlan[]>([]);
  const handleUpdatePlatformPlans = useCallback((next: SubscriptionPlan[]) => {
    const prev = platformPlansRef.current;
    platformPlansRef.current = next;
    setPlatformPlans(next);

    const prevById = new Map(prev.map(p => [p.id, p] as const));
    for (const plan of next) {
      const before = prevById.get(plan.id);
      if (!before || before !== plan) void savePlan(plan);
    }
    const nextIds = new Set(next.map(p => p.id));
    for (const plan of prev) {
      if (!nextIds.has(plan.id)) void deletePlan(plan.id);
    }
  }, []);
  platformPlansRef.current = platformPlans;

  // Keep admin configurations persisted when modified
  React.useEffect(() => {
    // Use safeSetItem (never throws) to avoid QuotaExceededError freezes.
    // For bulky lists (merchants, audit logs), persist only lightweight index metadata.
    safeSetItem('ZID_ADMIN_PAYMENT_CONFIG', adminPaymentConfig);
    safeSetItem('ZID_PLATFORM_SETTINGS', platformSettings);
    safeSetItem('ZID_PLATFORM_ANNOUNCEMENT', platformAnnouncement);
    safeSetItem('ZID_PLATFORM_PLANS', platformPlans);
    safeSetItem('ZID_PLATFORM_THEMES', platformThemes);
    safeSetItem('ZID_SUPPORT_TICKETS', supportTickets);
    safeSetItem('ZID_PLATFORM_ADDONS', platformAddons);
    // Audit history is server-backed; persist only lightweight metadata.
    safeSetItem('ZID_AUDIT_LOGS_INDEX', { lastUpdated: Date.now(), count: auditLogs.length });
    safeSetItem('ZID_SECURITY_SETTINGS', platformSecuritySettings);
    safeSetItem('ZID_BROADCAST_HISTORY', broadcastHistory);
    safeSetItem('ZID_AUTOMATION_SETTINGS', automationSettings);
    safeSetItem('ZID_ADMIN_TEAM', adminTeam);
    safeSetItem('ZID_ROLE_PERMISSIONS', rolePermissions);
  }, [adminPaymentConfig, platformSettings, platformAnnouncement, platformPlans, platformThemes, supportTickets, platformAddons, auditLogs, platformSecuritySettings, broadcastHistory, automationSettings, adminTeam, rolePermissions]);

  React.useEffect(() => {
    safeSetItem('ZID_PENDING_REQUESTS', pendingRequests);
  }, [pendingRequests]);

  React.useEffect(() => {
    // Do NOT persist the full merchant list to localStorage — it caused QuotaExceededError.
    // Merchants are kept in React state (sourced from MongoDB/initialAllMerchants).
    // Persist only a lightweight index (count + last-updated).
    safeSetItem('ZID_ALL_MERCHANTS_INDEX', { lastUpdated: Date.now(), count: allMerchants.length });
  }, [allMerchants]);

  // Enforce Tab Title strictly to "Zid SaaS BD" across all dashboard routing and layout views
  React.useEffect(() => {
    document.title = "Zid SaaS BD";
    const interval = setInterval(() => {
      if (document.title !== "Zid SaaS BD") {
        document.title = "Zid SaaS BD";
      }
    }, 500);
    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    if (!authLoading) {
      window.dispatchEvent(new Event('zid-app-ready'));
    }
  }, [authLoading]);

  React.useEffect(() => {
    document.title = "Zid SaaS BD";

    const faviconEl = document.getElementById('app-favicon') as HTMLLinkElement | null;
    if (faviconEl) {
      faviconEl.href = '/favicon.svg';
    }
  }, []);

  React.useEffect(() => {
    safeSetItem('ZID_THEME_PURCHASE_REQUESTS', themePurchaseRequests);
  }, [themePurchaseRequests]);

  const handleAddThemePurchaseRequest = (req: ThemePurchaseRequest) => {
    setThemePurchaseRequests(prev => [req, ...prev]);
  };

  // Modal States
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  const [isStorefrontPreviewOpen, setIsStorefrontPreviewOpen] = useState(false);
  const [isAdminLoginModalOpen, setIsAdminLoginModalOpen] = useState(false);

  // Super Admin Security States
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState<string>('');
  const [adminLoginError, setAdminLoginError] = useState<string>('');

  const handleLoginSuccess = (userProfile: MerchantProfile) => {
    setMerchant(userProfile);
    setIsAuthenticated(true);
    setShowLanding(false);

    // Record this browser as an active device so Security settings can show a
    // real session list and "Log Out All Other Devices" has something to revoke.
    try {
      const storeRef = userProfile.storeSlug || userProfile.storeCode || userProfile.store_code || userProfile.id;
      if (storeRef) {
        let sessionId = sessionStorage.getItem('zid_merchant_session_id');
        if (!sessionId) {
          sessionId = `sess_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
          sessionStorage.setItem('zid_merchant_session_id', sessionId);
        }
        fetch('/api/security/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ store_slug: storeRef, sessionId }),
        }).catch(err => console.warn('Session register warning:', err));
      }
    } catch (err) {
      console.warn('Session register warning:', err);
    }

    // Explicit Dashboard Navigation
    const slug = userProfile.storeSlug || 'my-store';
    window.history.pushState({}, '', `/dashboard/${slug}`);
    setCurrentPath(`/dashboard/${slug}`);
    setActiveTab('dashboard');

    const intendedPlan = localStorage.getItem('zid_intended_plan');
    const prePayment = localStorage.getItem('zid_pre_payment');

    const isAlreadyPaid = userProfile.subscriptionPlan && userProfile.subscriptionPlan !== 'free_trial' && userProfile.subscriptionPlan !== 'trial';

    if (!isAlreadyPaid && intendedPlan && intendedPlan !== 'free_trial' && !prePayment) {
      setIsSubscriptionModalOpen(true);
    }

    try {
      // Restore this logged-in merchant's specific data from database
      const stored = localStorage.getItem(`ZID_MERCHANT_STORE_DATA_${userProfile.storeSlug}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.products) setProducts(parsed.products);
        if (parsed.bankAccounts) setBankAccounts(parsed.bankAccounts);
        if (parsed.mobileBanking) setMobileBanking(parsed.mobileBanking);
        if (parsed.codConfig) setCodConfig(parsed.codConfig);
        if (parsed.orders) setOrders(normalizeOrders(parsed.orders));
        if (parsed.themes) setThemes(parsed.themes);
      } else {
        // Fallback or fresh merchant setup
        setProducts([]);
        setBankAccounts([]);
        setMobileBanking(initialMobileBanking);
        setCodConfig(initialCodConfig);
        setOrders([]);
        setThemes([]);
      }
    } catch (e) {
      console.error('Error restoring merchant workspace:', e);
    }
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem('zid_auth_session');
      localStorage.removeItem('zid_intended_plan');
    } catch (e) {
      console.error(e);
    }
    setIsAuthenticated(false);
    setShowLanding(true);
    window.history.pushState({}, '', '/');
    setCurrentPath('/');
  };

  const handleToggleCurrency = () => {
    setMerchant((prev) => ({
      ...prev,
      currency: prev.currency === 'BDT' ? 'USD' : 'BDT',
    }));
  };

  const handleConfirmSubscription = async (planId: string, paymentMethod: string, txId: string) => {
    // Resolve the plan from the LIVE database-backed catalogue so the recorded
    // amount/name match exactly what the merchant saw in the plan modal.
    const catalogue = platformPlans.length > 0 ? platformPlans : subscriptionPlans;
    const plan = catalogue.find(p => p.id === planId) || catalogue[0];

    // Calculate exact start and expiry timestamps dynamically based on chosen plan
    const { plan_started_at, expires_at, expiryDate, durationDays } = calculatePlanTimestamps(planId, new Date());
    const expiryDateStr = expiryDate;

    const newReq: SubscriptionRequest = {
      id: `req-${Date.now()}`,
      storeName: merchant?.storeName || 'My Store',
      email: merchant?.email || '',
      planId,
      planName: plan.name,
      amountBDT: plan.price,
      paymentMethod,
      transactionId: txId,
      requestedAt: new Date().toISOString().split('T')[0],
      status: 'pending'
    };

    setPendingRequests(prev => [newReq, ...prev]);

    try {
      const { updatedProfile } = await syncMerchantSubscription({
        merchant,
        planId,
        startDate: new Date(),
        transactionId: txId,
        paymentMethod,
        status: 'pending'
      });
      setMerchant(updatedProfile);
    } catch (e) {
      console.error('Failed to update subscription in DB', e);
    }

    alert(`Subscription request submitted successfully! Your Transaction ID (${txId}) is pending Super Admin verification.`);
  };

  const handleUpdateCustomers = async (updatedCustomers: Customer[]) => {
    setCustomers(updatedCustomers);
    if (merchant?.id) {
      await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedCustomers.map(c => ({ ...c, merchantId: merchant.id })))
      }).catch(err => console.error('Error updating customers in DB:', err));
    }
  };

  const handleUpdateOrders = async (updatedOrders: Order[]) => {
    setOrders(updatedOrders);
    if (merchant?.id) {
      await fetch(`${window.location.origin}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedOrders.map(o => ({ ...o, merchantId: merchant.id })))
      }).catch(err => console.error('Error updating orders in DB:', err));
    }
  };

  if (currentPath.startsWith('/store/') || currentPath.startsWith('/e/')) {
    const isE = currentPath.startsWith('/e/');
    const storeSlug = currentPath.replace(isE ? '/e/' : '/store/', '').split('/')[0];

    // Retrieve direct custom tenant store configurations from database
    let targetMerchant = merchant;
    let targetProducts = products;
    let targetBankAccounts = bankAccounts;
    let targetMobileBanking = mobileBanking;
    let targetThemes = themes;

    try {
      // Fetch precise custom configuration using unique store slug
      const customStoreDataStr = localStorage.getItem(`ZID_MERCHANT_STORE_DATA_${storeSlug}`);
      if (customStoreDataStr) {
        const parsed = JSON.parse(customStoreDataStr);
        if (parsed.merchant) targetMerchant = parsed.merchant;
        if (parsed.products) targetProducts = parsed.products;
        if (parsed.bankAccounts) targetBankAccounts = parsed.bankAccounts;
        if (parsed.mobileBanking) targetMobileBanking = parsed.mobileBanking;
        if (parsed.themes) targetThemes = parsed.themes;
      } else {
        // Fallback search in general merchant profiles index
        const matchedProfile = allMerchants.find(m => m.storeSlug === storeSlug);
        if (matchedProfile) {
          targetMerchant = matchedProfile;
        }
      }
    } catch (e) {
      console.error('Error fetching custom theme from database:', e);
    }

    // Resolve which LAYOUT this store's active theme maps to. TenantStorefrontView
    // renders the classic full-featured storefront for 'classic', and the
    // dedicated supermarket/fashion layouts for those themes. Unknown/absent
    // themes fall back to classic, so a store is never blank.
    const activeLayout = resolveLayoutForTheme({ id: targetMerchant?.activeThemeId });

    return (
      <TenantStorefrontView
        storeSlug={storeSlug || targetMerchant.storeSlug}
        merchant={targetMerchant}
        products={targetProducts}
        bankAccounts={targetBankAccounts}
        mobileBanking={targetMobileBanking}
        themes={targetThemes}
        layout={activeLayout}
onPlaceOrder={async (newOrder) => {
            try {
              // Persist order details back to that store's custom record
              const key = `ZID_MERCHANT_STORE_DATA_${storeSlug}`;
              const customStoreDataStr = localStorage.getItem(key);
              if (customStoreDataStr) {
                const parsed = JSON.parse(customStoreDataStr);
                parsed.orders = [newOrder, ...(parsed.orders || [])];
                safeSetItem(key, parsed);
              }
              // Append to current logged-in orders view if active
              if (merchant?.storeSlug === storeSlug) {
                setOrders(prev => [newOrder, ...prev]);
              }
            } catch (e) {
              console.error('Error recording order to database:', e);
            }
          }}
      />
    );
  }

  const isSuperAdminRoute =
    currentPath === '/admin' ||
    currentPath === '/super-admin' ||
    currentPath === '/admin-login' ||
    currentPath === '/super-admin-gateway' ||
    activeTab === 'super_admin_portal';

  if (isSuperAdminRoute) {
    if (!isAdminAuthenticated) {
      return (
        <div className="min-h-screen bg-[#12151F] text-slate-100 flex items-center justify-center p-4 font-sans">
          <div className="bg-[#181B26] border border-[#2E3548] p-8 rounded-2xl max-w-md w-full space-y-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-black text-white">Super Admin Gateway</h1>
                <p className="text-xs text-slate-400">Restricted Enterprise Platform Access</p>
              </div>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              if (adminPasswordInput === '3565') {
                setIsAdminAuthenticated(true);
                sessionStorage.setItem('zid_super_admin_auth', 'true');
                setAdminLoginError('');
              } else {
                setAdminLoginError('Invalid Master Password.');
              }
            }} className="space-y-4">
              <div>
                <label className="flex justify-between items-center text-xs font-semibold text-slate-300 mb-1.5">
                  <span>Master Password / PIN</span>
                  <span className="text-[10px] text-slate-500 font-normal">Default PIN: 3565</span>
                </label>
                <input
                  type="password"
                  value={adminPasswordInput}
                  onChange={(e) => setAdminPasswordInput(e.target.value)}
                  placeholder="Enter admin password..."
                  className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#D4AF37]"
                  required
                />
              </div>

              {adminLoginError && (
                <div className="bg-red-500/20 border border-red-500/40 text-red-400 p-3 rounded-xl text-xs font-bold">
                  {adminLoginError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('dashboard');
                    window.history.pushState({}, '', '/dashboard');
                    setCurrentPath('/dashboard');
                  }}
                  className="flex-1 bg-[#202533] hover:bg-[#282E3F] text-slate-300 font-bold py-3 rounded-xl text-sm transition border border-[#3A435E] cursor-pointer"
                >
                  Return to Store
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl text-sm transition shadow-lg shadow-red-600/30 cursor-pointer"
                >
                  Authenticate
                </button>
              </div>
            </form>
          </div>
        </div>
      );
    }

    return (
      <SuperAdminPortalView
        currentMerchant={merchant}
        onUpdateMerchant={setMerchant}
        adminPaymentConfig={adminPaymentConfig}
        onUpdateAdminPaymentConfig={handleUpdateAdminPaymentConfig}
        pendingRequests={pendingRequests}
        onUpdatePendingRequests={setPendingRequests}
        themePurchaseRequests={themePurchaseRequests}
        onUpdateThemePurchaseRequests={setThemePurchaseRequests}
        allMerchants={allMerchants}
        onUpdateAllMerchants={setAllMerchants}
        onSwitchToMerchantPortal={() => {
          setIsAdminAuthenticated(false);
          sessionStorage.removeItem('zid_super_admin_auth');
          setActiveTab('dashboard');
          window.history.pushState({}, '', '/dashboard');
          setCurrentPath('/dashboard');
        }}
        onLoginAsMerchant={(m) => {
          setMerchant(m);
          setIsAdminAuthenticated(false);
          sessionStorage.removeItem('zid_super_admin_auth');
          setIsAuthenticated(true);
          setShowLanding(false);
          setActiveTab('dashboard');
          window.history.pushState({}, '', '/dashboard');
          setCurrentPath('/dashboard');
        }}
        platformSettings={platformSettings}
        onUpdatePlatformSettings={handleUpdatePlatformSettings}
        platformAnnouncement={platformAnnouncement}
        onUpdatePlatformAnnouncement={handleUpdatePlatformAnnouncement}
        platformPlans={platformPlans}
        onUpdatePlatformPlans={handleUpdatePlatformPlans}
        platformThemes={platformThemes}
        onUpdatePlatformThemes={handleUpdatePlatformThemes}
        supportTickets={supportTickets}
        onUpdateSupportTickets={handleUpdateSupportTickets}
        platformAddons={platformAddons}
        onUpdatePlatformAddons={setPlatformAddons}
        auditLogs={auditLogs}
        onUpdateAuditLogs={handleUpdateAuditLogs}
        securitySettings={platformSecuritySettings}
        onUpdateSecuritySettings={handleUpdateSecuritySettings}
        broadcastHistory={broadcastHistory}
        onUpdateBroadcastHistory={handleUpdateBroadcastHistory}
        automationSettings={automationSettings}
        onUpdateAutomationSettings={handleUpdateAutomationSettings}
        adminTeam={adminTeam}
        onUpdateAdminTeam={handleUpdateAdminTeam}
        rolePermissions={rolePermissions}
        onUpdateRolePermissions={handleUpdateRolePermissions}
      />
    );
  }

  if (showLanding) {
    return (
      <PublicPricingLanding
        isAuthenticated={isAuthenticated}
        onGoToDashboard={() => {
          setShowLanding(false);
          setActiveTab('dashboard');
          window.history.pushState({}, '', '/dashboard');
          setCurrentPath('/dashboard');
        }}
        onSelectPlan={(planId) => {
          if (planId === 'free_trial') {
            safeSetItem('zid_intended_plan', planId);
            setAuthMode('signup');
            setShowLanding(false);
          } else {
            setPreAuthCheckoutPlan(planId);
            setShowLanding(false);
          }
        }}
        onLoginClick={() => {
          setAuthMode('login');
          setShowLanding(false);
        }}
      />
    );
  }

  if (!isAuthenticated) {
    if (preAuthCheckoutPlan) {
      return (
        <PublicCheckout
          planId={preAuthCheckoutPlan}
          adminPaymentConfig={adminPaymentConfig}
          onPaymentSuccess={(txId: string) => {
            safeSetItem('zid_pre_payment', { planId: preAuthCheckoutPlan, txId });
            setPreAuthCheckoutPlan(null);
            setAuthMode('signup');
          }}
          onCancel={() => {
            setPreAuthCheckoutPlan(null);
            setShowLanding(true);
          }}
        />
      );
    }

    return (
      <AuthFlow
        onLoginSuccess={handleLoginSuccess}
        defaultMerchant={initialMerchant}
        onAdminAccess={() => {
          setIsAdminAuthenticated(true);
          setActiveTab('super_admin_portal');
        }}
        initialMode={authMode}
      />
    );
  }

  return (
    <div className={`min-h-screen flex flex-col font-sans selection:bg-[#D4AF37] selection:text-slate-950 transition-colors duration-200 ${isDarkMode ? 'bg-[#141721] text-slate-100' : 'bg-[#F4F6F9] text-slate-900'
      }`}>
      {/* Global Platform Announcement */}
      {platformAnnouncement.isActive && (
        <div className={`py-1.5 px-4 text-center text-[10px] font-black uppercase tracking-[0.1em] shadow-sm relative z-[100] ${platformAnnouncement.type === 'urgent' ? 'bg-red-600 text-white' :
          platformAnnouncement.type === 'warning' ? 'bg-orange-500 text-slate-950' :
            'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950'
          }`}>
          {platformAnnouncement.message}
        </div>
      )}

      {/* TRIAL EXPIRY LOCK SCREEN */}
      {isTrialExpired && (
        <div className="fixed inset-0 z-[9999] bg-[#0f172a] flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#1e293b] border border-red-500/30 rounded-3xl p-8 text-center space-y-6 shadow-2xl">
            <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
              <ShieldAlert className="w-10 h-10 text-red-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-white">ট্রায়াল শেষ হয়েছে!</h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                আপনার ৩০ দিনের ফ্রি ট্রায়ালের মেয়াদ শেষ হয়েছে! দোকান চালু রাখতে এবং সেলস অব্যাহত রাখতে অনুগ্রহ করে একটি প্ল্যান বেছে নিন।
              </p>
            </div>
            <button
              onClick={() => setIsSubscriptionModalOpen(true)}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-indigo-600/20"
            >
              এখনই প্ল্যান বেছে নিন
            </button>
          </div>
        </div>
      )}

      {/* Trial Countdown Banner — STRICTLY for the initial trial state.
          `isTrialActive` is already false for any store with a paid plan id, and
          `isPaidPlan` additionally covers a MongoDB `subscription_status: ACTIVE`
          that the local profile has not caught up with yet. Belt-and-braces on
          purpose: an approved PRO PLAN store must never see this bar. */}
      {isTrialActive && !isPaidPlan && !dbReportsActive && (
        <div className="bg-indigo-600/10 border-b border-indigo-500/20 py-2.5 px-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
                <Clock className="w-4 h-4" />
              </div>
              <p className="text-xs md:text-sm font-medium text-slate-200">
                আপনার ফ্রি ট্রায়ালের আর <span className="text-white font-black px-1.5 py-0.5 rounded bg-indigo-600/30 border border-indigo-500/30">{trialDaysRemaining} দিন</span> বাকি আছে। এখনই প্ল্যান বেছে নিন।
              </p>
            </div>
            <button
              onClick={() => setIsSubscriptionModalOpen(true)}
              className="hidden md:flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-indigo-400 hover:text-white transition-colors"
            >
              <span>View Plans</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          productSubTab={productSubTab}
          onSelectProductSubTab={setProductSubTab}
          customerSubTab={customerSubTab}
          onSelectCustomerSubTab={setCustomerSubTab}
          storeSubTab={storeSubTab}
          onSelectStoreSubTab={setStoreSubTab}
          settingsSubTab={settingsSubTab}
          onSelectSettingsSubTab={setSettingsSubTab}
          isOpenMobile={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
          ordersBadgeCount={orders.length}
          onOpenAdminLogin={() => setIsAdminLoginModalOpen(true)}
          isDarkMode={isDarkMode}
          platformSettings={platformSettings}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          {/* Top Sticky Header */}
          <Header
            merchant={merchant}
            orders={orders}
            products={products}
            merchants={allMerchants}
            pendingRequests={pendingRequests}
            platformSettings={platformSettings}
            isDarkMode={isDarkMode}
            onToggleTheme={handleToggleTheme}
            onOpenSubscriptionModal={() => setIsSubscriptionModalOpen(true)}
            onOpenStorefrontPreview={() => setIsStorefrontPreviewOpen(true)}
            onToggleCurrency={handleToggleCurrency}
            onLogout={handleLogout}
            onNavigateTab={setActiveTab}
            onQuickAddProduct={() => setActiveTab('products')}
            onToggleSidebarMobile={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
          />

          {/* View Container */}
          <main className="p-4 lg:p-6 max-w-7xl w-full mx-auto space-y-6">
            {activeTab === 'dashboard' && (
              <DashboardView
                merchant={merchant}
                orders={orders}
                products={products}
                onNavigateTab={setActiveTab}
                onOpenSubscriptionModal={() => setIsSubscriptionModalOpen(true)}
              />
            )}

            {activeTab === 'orders' && (
              <OrdersView
                orders={orders}
                onUpdateOrders={handleUpdateOrders}
                merchantId={merchant?.id}
                storeSlug={merchant?.storeSlug}
              />
            )}

            {activeTab === 'products' && (
              <ProductsView
                products={products}
                onUpdateProducts={setProducts}
                activeSubTab={productSubTab}
                onSelectSubTab={setProductSubTab}
                onOpenSubscriptionModal={() => setIsSubscriptionModalOpen(true)}
                merchant={merchant}
                platformSettings={platformSettings}
              />
            )}

            {activeTab === 'customers' && (
              <CustomersView
                customers={customers}
                onUpdateCustomers={handleUpdateCustomers}
                activeSubTab={customerSubTab}
                onSelectSubTab={setCustomerSubTab}
              />
            )}

            {activeTab === 'marketing' && (
              <MarketingView
                merchant={merchant}
                platformSettings={platformSettings}
                adminPaymentConfig={adminPaymentConfig}
                onOpenSubscriptionModal={() => setIsSubscriptionModalOpen(true)}
              />
            )}

            {(activeTab === 'whatsapp' || activeTab === 'apps') && (
              <AppsWhatsAppView merchant={merchant} platformSettings={platformSettings} onOpenSubscriptionModal={() => setIsSubscriptionModalOpen(true)} />
            )}

            {activeTab === 'store' && (
              <OnlineStoreView
                onOpenStorefrontPreview={() => setIsStorefrontPreviewOpen(true)}
                activeSubTab={storeSubTab}
                onSelectSubTab={setStoreSubTab}
                merchant={merchant}
                setMerchant={setMerchant}
                adminPaymentConfig={adminPaymentConfig}
                themePurchaseRequests={themePurchaseRequests}
                onAddThemePurchaseRequest={handleAddThemePurchaseRequest}
                isPremiumPlan={isPremiumPlan}
                onOpenSubscriptionModal={() => setIsSubscriptionModalOpen(true)}
                platformThemes={platformThemes}
              />
            )}

            {activeTab === 'analytics' && (
              <AnalyticsView orders={orders} />
            )}

            {activeTab === 'logistics' && (
              <LogisticsView
                merchant={merchant}
                couriers={couriers}
                codConfig={codConfig}
                onUpdateCouriers={setCouriers}
                onUpdateCodConfig={setCodConfig}
              />
            )}

            {activeTab === 'payments' && (
              <PaymentsView
                bankAccounts={bankAccounts}
                mobileBanking={mobileBanking}
                codConfig={codConfig}
                gatewayConfig={gatewayConfig}
                onUpdateBankAccounts={setBankAccounts}
                onUpdateMobileBanking={setMobileBanking}
                onUpdateCodConfig={setCodConfig}
                onUpdateGatewayConfig={setGatewayConfig}
              />
            )}

            {activeTab === 'financing' && (
              <FinancingView merchant={merchant} />
            )}

            {activeTab === 'growth' && (
              <GrowthView
                merchant={merchant}
                onSwitchToBilling={() => setActiveTab('billing')}
              />
            )}

            {activeTab === 'channels' && (
              <ChannelsView />
            )}

            {activeTab === 'settings' && (
              <SettingsView
                merchant={merchant}
                onUpdateMerchant={setMerchant}
                initialSubTab={settingsSubTab}
              />
            )}

            {activeTab === 'billing' && (
              <BillingView
                merchant={merchant}
                pendingRequests={pendingRequests}
                onOpenSubscriptionModal={() => setIsSubscriptionModalOpen(true)}
                onBack={() => setActiveTab('settings')}
              />
            )}
          </main>
        </div>
      </div>

      {/* Subscription Plan Modal */}
      <SubscriptionModal
        isOpen={isSubscriptionModalOpen}
        onClose={() => setIsSubscriptionModalOpen(false)}
        merchant={merchant}
        pendingRequests={pendingRequests}
        onConfirmSubscription={handleConfirmSubscription}
        adminPaymentConfig={adminPaymentConfig}
        initialPlanId={localStorage.getItem('zid_intended_plan') || undefined}
        plans={platformPlans}
      />

      {/* Storefront Customer Preview Drawer Modal */}
      <StorefrontPreviewModal
        isOpen={isStorefrontPreviewOpen}
        onClose={() => setIsStorefrontPreviewOpen(false)}
        merchant={merchant}
        products={products}
        bankAccounts={bankAccounts}
        mobileBanking={mobileBanking}
      />

      {/* Admin Login Modal for In-App Preview */}
      {isAdminLoginModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181B26] border border-[#2E3548] p-8 rounded-2xl max-w-md w-full space-y-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setIsAdminLoginModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white cursor-pointer"
            >
              ✕
            </button>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-white">Super Admin Portal Gateway</h3>
                <p className="text-xs text-slate-400">Enter authorization passcode to proceed.</p>
              </div>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              if (adminPasswordInput === '3565') {
                setIsAdminAuthenticated(true);
                setIsAdminLoginModalOpen(false);
                setAdminLoginError('');
                setActiveTab('super_admin_portal');
              } else {
                setAdminLoginError('Invalid Master Password.');
              }
            }} className="space-y-4">
              <div>
                <label className="flex justify-between items-center text-xs font-semibold text-slate-300 mb-1.5">
                  <span>Master Password / PIN</span>
                  <span className="text-[10px] text-slate-500 font-normal">Default PIN: 3565</span>
                </label>
                <input
                  type="password"
                  value={adminPasswordInput}
                  onChange={(e) => setAdminPasswordInput(e.target.value)}
                  placeholder="Enter admin password..."
                  className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#D4AF37]"
                  required
                  autoFocus
                />
              </div>

              {adminLoginError && (
                <div className="bg-red-500/20 border border-red-500/40 text-red-400 p-3 rounded-xl text-xs font-bold">
                  {adminLoginError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAdminLoginModalOpen(false)}
                  className="flex-1 bg-[#202533] hover:bg-[#282E3F] text-slate-300 font-bold py-3 rounded-xl text-sm transition border border-[#3A435E] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl text-sm transition shadow-lg shadow-red-600/30 cursor-pointer"
                >
                  Unlock Admin Portal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
