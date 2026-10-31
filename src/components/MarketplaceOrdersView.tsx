import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, Package, Truck, CheckCircle2, Clock, XCircle,
  Receipt, ArrowRight, RefreshCw, Search, ShoppingBag, Store,
} from 'lucide-react';
import SafeImage from './SafeImage';
import { normalizeOrders } from '../utils/orderUtils';
import {
  getOrderStatusBadge,
  getPaymentBadge,
  getTrackingStepIndex,
  TRACKING_STEPS,
  CUSTOMER_ORDERS_POLL_MS,
} from '../lib/orderTracking';
import type { Order } from '../types';

/**
 * The shopper's own order history — `/marketplace/orders`.
 *
 * ── Why this page exists ──────────────────────────────────────────────────
 * The account menu's "Orders" row used to hand off to a storefront tab, and
 * before that it fell through to the MERCHANT dashboard. A customer asking
 * "where is my order?" must never land in a seller's admin panel. This is a
 * customer-only surface: it reads the session, calls the phone-scoped
 * `/api/customer/orders` endpoint (never the platform-wide orders route) and
 * offers nothing but the shopper's own orders and a way back to shopping.
 *
 * It spans every store, because a marketplace shopper buys from several.
 */

const THEME = {
  bg: '#f6f7fb',
  surface: '#ffffff',
  ink: '#111827',
  inkMuted: '#6b7280',
  line: '#e5e7eb',
  brand: '#3b2fd6',
  accent: '#ff9f1c',
  danger: '#e11d48',
  success: '#0f9d58',
} as const;

const bdt = (value: number) => `৳${Math.round(Number(value) || 0).toLocaleString('en-US')}`;

type Lang = 'en' | 'bn';

type Session = { name: string; email: string; phone: string } | null;

function readSession(): Session {
  try {
    const raw = localStorage.getItem('zid_customer_session');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const name = String(parsed?.name || '').trim();
    const email = String(parsed?.email || '').trim();
    const phone = String(parsed?.phone || '').trim();
    if (!name && !email && !phone) return null;
    return { name, email, phone };
  } catch {
    return null;
  }
}

function readLang(): Lang {
  try {
    return (localStorage.getItem('zid_marketplace_lang') as Lang) || 'en';
  } catch {
    return 'en';
  }
}

/** Date shown as "12 Mar 2026"; invalid/missing dates render as a dash. */
function formatDate(value?: string, lang: Lang = 'en'): string {
  if (!value) return '—';
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return '—';
  return new Date(ts).toLocaleDateString(lang === 'bn' ? 'bn-BD-u-nu-beng' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

interface Props {
  /** Back to the marketplace. */
  onBack: () => void;
  /** Open a storefront (used by "Visit store" on a card). */
  onVisitStore?: (slug: string) => void;
  /** Send the shopper to sign in (storefront modal when a store is known). */
  onSignIn?: () => void;
}

export const MarketplaceOrdersView: React.FC<Props> = ({ onBack, onVisitStore, onSignIn }) => {
  const [lang, setLang] = useState<Lang>(() => readLang());
  const [session, setSession] = useState<Session>(() => readSession());
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'active' | 'past'>('active');
  const [query, setQuery] = useState('');

  const t = useCallback(
    (en: string, bn: string) => (lang === 'bn' ? bn : en),
    [lang],
  );

  // This page owns `<html lang>` while mounted — see the matching note in
  // MegaMarketplaceView. Without the marker the app-wide LanguageProvider
  // resets the attribute to its own (dashboard) preference.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.setAttribute('data-owns-lang', 'orders');
    document.documentElement.lang = lang;
    return () => { document.body.removeAttribute('data-owns-lang'); };
  }, [lang]);

  // Re-read the session on focus: the shopper may have signed in on the
  // storefront and come straight here.
  // Read the stored preference on mount — and again on focus — so returning
  // from the marketplace with a new language applies here too. (Relying only on
  // the state initialiser left `lang` stale when the preference changed in
  // another view within the same SPA session.)
  useEffect(() => {
    const sync = () => {
      setSession(readSession());
      setLang(readLang());
    };
    setLang(readLang());
    window.addEventListener('focus', sync);
    window.addEventListener('storage', sync);
    window.addEventListener('zid:customer-session', sync);
    return () => {
      window.removeEventListener('focus', sync);
      window.removeEventListener('storage', sync);
      window.removeEventListener('zid:customer-session', sync);
    };
  }, []);

  const [phoneInput, setPhoneInput] = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);

  const handlePhoneLookup = (e: React.FormEvent) => {
    e.preventDefault();
    const digits = phoneInput.replace(/\D/g, '');
    if (digits.length < 10) {
      setLookupError(
        t(
          'Please enter a valid phone number (at least 10 digits).',
          'অনুগ্রহ করে একটি সঠিক ফোন নম্বর লিখুন (কমপক্ষে ১০ ডিজিট)।',
        ),
      );
      return;
    }
    setLookupError(null);
    const newSession: Session = {
      name: '',
      email: '',
      phone: digits,
    };
    try {
      localStorage.setItem('zid_customer_session', JSON.stringify(newSession));
      window.dispatchEvent(new CustomEvent('zid:customer-session', { detail: newSession }));
    } catch {
      // ignore storage error
    }
    setSession(newSession);
  };

  const handleSignOut = () => {
    try {
      localStorage.removeItem('zid_customer_session');
      window.dispatchEvent(new CustomEvent('zid:customer-session', { detail: null }));
    } catch {
      // ignore storage error
    }
    setSession(null);
    setOrders([]);
  };

  /**
   * Load the shopper's orders.
   *
   * The phone is the identity the server filters on — this call can only ever
   * return that number's orders, so no client-side trust is involved.
   */
  /**
   * Monotonic request id.
   *
   * Polling and manual refreshes can overlap; without this a SLOW earlier
   * response could land after a fast newer one and repaint stale data. Every
   * load takes a ticket and only the newest ticket may write state.
   */
  const requestSeq = useRef(0);

  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
    const phone = session?.phone || '';
    if (!phone) {
      setOrders([]);
      setLoading(false);
      return;
    }
    const ticket = ++requestSeq.current;
    if (!opts.silent) setLoading(true);
    try {
      const params = new URLSearchParams({ customer_phone: phone });
      const res = await fetch(`/api/customer/orders?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      const data = await res.json().catch(() => null);
      // A newer request has already started — discard this answer entirely.
      if (ticket !== requestSeq.current) return;
      if (!res.ok || !data?.ok) {
        // A failed read must not wipe a list that is already on screen.
        if (!opts.silent) {
          setOrders([]);
          setError(data?.error || 'Could not load your orders.');
        }
        return;
      }
      setError(null);
      setOrders(normalizeOrders(data.orders));
    } catch {
      if (ticket !== requestSeq.current) return;
      if (!opts.silent) setError('Could not load your orders. Please try again.');
    } finally {
      if (ticket === requestSeq.current && !opts.silent) setLoading(false);
    }
    /*
     * `t` is deliberately NOT a dependency.
     *
     * It used to be, and because `t` is rebuilt whenever `lang` changes, a
     * language switch re-created `load` → re-ran the mount effect → re-fetched
     * the whole order list AND tore down/re-created the poll timer. The messages
     * above are stored as KEYS-free plain strings rendered at the call site, so
     * the callback itself does not need the language.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.phone]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll so a merchant's status change (Processing → Delivered) appears while
  // the shopper is looking at the page, without a manual refresh.
  useEffect(() => {
    if (!session?.phone) return;
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void load({ silent: true });
    }, CUSTOMER_ORDERS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [load, session?.phone]);

  /** Active = not yet delivered and not cancelled; past = everything settled. */
  const isActive = useCallback((order: Order) => {
    const badge = getOrderStatusBadge(order);
    return !badge.cancelled && badge.rank < 3;
  }, []);

  const { activeOrders, pastOrders } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (o: Order) => {
      if (!q) return true;
      return (
        String(o.orderNumber || o.id || '').toLowerCase().includes(q) ||
        String(o.customerName || '').toLowerCase().includes(q) ||
        String((o as any).store_name || (o as any).vendor_name || '').toLowerCase().includes(q) ||
        (o.items || []).some((it) => String(it.productName || '').toLowerCase().includes(q))
      );
    };
    const filtered = orders.filter(matches);
    return {
      activeOrders: filtered.filter(isActive),
      pastOrders: filtered.filter((o) => !isActive(o)),
    };
  }, [orders, query, isActive]);

  const shown = tab === 'active' ? activeOrders : pastOrders;

  return (
    <div className="min-h-screen w-full font-sans" style={{ backgroundColor: THEME.bg, color: THEME.ink }}>
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 border-b bg-white" style={{ borderColor: THEME.line }}>
        <div className="mx-auto flex max-w-[1100px] items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={onBack}
            className="flex h-9 items-center gap-1 rounded-lg px-2 text-[12.5px] font-bold transition hover:bg-[#f4f5ff]"
            style={{ color: THEME.brand }}
          >
            <ChevronLeft className="h-4 w-4" />
            {t('Back to marketplace', 'মার্কেটপ্লেসে ফিরে যান')}
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLang((v) => (v === 'en' ? 'bn' : 'en'))}
              className="rounded-lg border px-2.5 py-1.5 text-[11px] font-bold text-slate-600 transition hover:bg-[#f4f5ff]"
              style={{ borderColor: THEME.line }}
              aria-label={t('Switch language', 'ভাষা পরিবর্তন')}
            >
              {lang === 'en' ? 'বাংলা' : 'English'}
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="flex h-9 w-9 items-center justify-center rounded-lg border text-slate-500 transition hover:bg-[#f4f5ff]"
              style={{ borderColor: THEME.line }}
              aria-label={t('Refresh orders', 'অর্ডার রিফ্রেশ করুন')}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] px-4 py-6">
        <div className="mb-5">
          <h1 className="flex items-center gap-2 text-[20px] font-black tracking-tight text-slate-900">
            <Receipt className="h-5 w-5" style={{ color: THEME.brand }} />
            {t('My Orders', 'আমার অর্ডার')}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-slate-500">
            {session?.phone ? (
              <>
                <span>
                  {t(
                    `Orders placed with ${session.phone}${session.email ? ` (${session.email})` : ''}.`,
                    `${session.phone} নম্বরের অর্ডারসমূহ।`,
                  )}
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="font-bold underline decoration-slate-300 underline-offset-2 transition hover:text-slate-900"
                  style={{ color: THEME.brand }}
                >
                  {t('Change phone', 'নম্বর পরিবর্তন')}
                </button>
              </>
            ) : (
              <span>{t('Look up your orders with your phone number.', 'আপনার ফোন নম্বর দিয়ে অর্ডার খুঁজুন।')}</span>
            )}
          </div>
        </div>

        {/* ── Lookup / Guest tracking card ── */}
        {(!session || !session.phone) && (
          <div className="mx-auto max-w-lg rounded-2xl border bg-white p-8 text-center shadow-sm" style={{ borderColor: THEME.line }}>
            <ShoppingBag className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <div className="text-[16px] font-black text-slate-800">
              {t('Track Your Marketplace Orders', 'মার্কেটপ্লেস অর্ডার ট্র্যাক করুন')}
            </div>
            <p className="mx-auto mt-1.5 max-w-sm text-[12.5px] text-slate-500">
              {t(
                'Enter the phone number used during checkout to view your order history and live delivery status.',
                'চেকআউটের সময় ব্যবহৃত ফোন নম্বরটি লিখুন এবং আপনার অর্ডার ও ডেলিভারি স্ট্যাটাস দেখুন।',
              )}
            </p>
            <form onSubmit={handlePhoneLookup} className="mt-5 space-y-3">
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="01XXXXXXXXX"
                  className="min-h-[44px] flex-1 rounded-xl border px-3.5 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-[#3b2fd6] focus:outline-none"
                  style={{ borderColor: THEME.line }}
                  autoFocus
                />
                <button
                  type="submit"
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-5 text-[13px] font-black text-white transition hover:opacity-95"
                  style={{ backgroundColor: THEME.brand }}
                >
                  {t('Find Orders', 'অর্ডার খুঁজুন')}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
              {lookupError && (
                <p className="text-left text-[11.5px] font-medium text-rose-600">{lookupError}</p>
              )}
            </form>
          </div>
        )}

        {/* ── Signed in ── */}
        {session && session.phone && (
          <>
            {/* Controls: tabs + search */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <div
                className="flex overflow-hidden rounded-xl border bg-white p-0.5"
                style={{ borderColor: THEME.line }}
                role="tablist"
                aria-label={t('Order filters', 'অর্ডার ফিল্টার')}
              >
                {([
                  { id: 'active' as const, label: t('Active', 'চলমান'), count: activeOrders.length },
                  { id: 'past' as const, label: t('Past orders', 'পুরনো অর্ডার'), count: pastOrders.length },
                ]).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === item.id}
                    onClick={() => setTab(item.id)}
                    className={`flex min-h-[36px] items-center gap-1.5 rounded-lg px-3.5 text-[12.5px] font-bold transition ${tab === item.id ? 'text-white' : 'text-slate-600 hover:bg-[#f4f5ff]'
                      }`}
                    style={tab === item.id ? { backgroundColor: THEME.brand } : undefined}
                  >
                    {item.label}
                    <span
                      className={`rounded-full px-1.5 text-[10px] font-black ${tab === item.id ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'
                        }`}
                    >
                      {item.count}
                    </span>
                  </button>
                ))}
              </div>

              <label
                className="ml-auto flex min-h-[40px] min-w-[220px] flex-1 items-center gap-2 rounded-xl border bg-white px-3 sm:max-w-[320px]"
                style={{ borderColor: THEME.line }}
              >
                <Search className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('Search by order number or product', 'অর্ডার নম্বর বা পণ্য দিয়ে খুঁজুন')}
                  aria-label={t('Search orders', 'অর্ডার খুঁজুন')}
                  className="min-w-0 flex-1 bg-transparent text-[12.5px] text-slate-800 placeholder:text-slate-400 focus:outline-none"
                />
              </label>
            </div>

            {error && (
              <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[12.5px] text-rose-700">
                {/* The loader stores a language-neutral reason; the copy is
                    chosen HERE so it stays right after a language switch —
                    the list is not re-fetched just to translate a message. */}
                {/Could not load/i.test(error) ? (
                  <>
                    {t('Could not load your orders.', 'আপনার অর্ডার লোড করা যায়নি।')}{' '}
                    {t('Please try again.', 'আবার চেষ্টা করুন।')}
                  </>
                ) : (
                  error
                )}
              </div>
            )}

            {/* Loading skeleton */}
            {loading && orders.length === 0 && (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-[118px] animate-pulse rounded-2xl border bg-white" style={{ borderColor: THEME.line }} />
                ))}
              </div>
            )}

            {/* Empty state */}
            {!loading && shown.length === 0 && !error && (
              <div className="rounded-2xl border bg-white p-10 text-center shadow-sm" style={{ borderColor: THEME.line }}>
                <Package className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                <div className="text-[14px] font-black text-slate-800">
                  {query
                    ? t('No orders match your search', 'আপনার সার্চের সাথে কোনো অর্ডার মেলেনি')
                    : tab === 'active'
                      ? t('No active orders', 'কোনো চলমান অর্ডার নেই')
                      : t('No past orders yet', 'এখনো কোনো পুরনো অর্ডার নেই')}
                </div>
                <p className="mt-1.5 text-[12.5px] text-slate-500">
                  {query
                    ? t('Try a different order number or product name.', 'অন্য অর্ডার নম্বর বা পণ্যের নাম দিয়ে চেষ্টা করুন।')
                    : t('Orders you place on the marketplace will appear here.', 'মার্কেটপ্লেসে করা অর্ডার এখানে দেখা যাবে।')}
                </p>
                {!query && tab === 'active' && (
                  <button
                    type="button"
                    onClick={onBack}
                    className="mt-5 inline-flex min-h-[42px] items-center gap-2 rounded-xl px-5 text-[13px] font-black text-white"
                    style={{ backgroundColor: THEME.brand }}
                  >
                    {t('Start shopping', 'কেনাকাটা শুরু করুন')}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}

            {/* Order cards */}
            <div className="space-y-3">
              {shown.map((order) => (
                <OrderCard
                  key={String(order.id)}
                  order={order}
                  lang={lang}
                  onVisitStore={onVisitStore}
                />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

/* ───────────────────────────── order card ───────────────────────────── */

const OrderCard: React.FC<{
  order: Order;
  lang: Lang;
  onVisitStore?: (slug: string) => void;
}> = ({ order, lang, onVisitStore }) => {
  const badge = getOrderStatusBadge(order);
  const payment = getPaymentBadge(order);
  const stepIndex = getTrackingStepIndex(order);
  const items = order.items || [];
  const storeSlug = String((order as any).store_slug || (order as any).storeSlug || '');
  const storeName = String((order as any).store_name || (order as any).vendor_name || '');
  const statusLabel = lang === 'bn' ? badge.labelBn : badge.label;

  const statusIcon = badge.cancelled
    ? XCircle
    : badge.rank === 3
      ? CheckCircle2
      : badge.rank === 2
        ? Truck
        : Clock;

  const StatusIcon = statusIcon;

  return (
    <article
      className="overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:shadow-md"
      style={{ borderColor: THEME.line }}
    >
      {/* Card head — order number, date, status */}
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b px-4 py-2.5"
        style={{ borderColor: THEME.line, backgroundColor: '#fbfbfe' }}
      >
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            {lang === 'bn' ? 'অর্ডার' : 'Order'}
          </div>
          <div className="truncate text-[12.5px] font-black text-slate-800">
            #{order.orderNumber || order.id}
          </div>
        </div>
        <div className="hidden sm:block">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            {lang === 'bn' ? 'তারিখ' : 'Placed on'}
          </div>
          <div className="text-[12.5px] font-semibold text-slate-700">{formatDate(order.createdAt, lang)}</div>
        </div>
        {storeName && (
          <div className="hidden min-w-0 md:block">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              {lang === 'bn' ? 'স্টোর' : 'Sold by'}
            </div>
            <button
              type="button"
              onClick={() => storeSlug && onVisitStore?.(storeSlug)}
              disabled={!storeSlug}
              className="flex max-w-[180px] items-center gap-1 truncate text-[12.5px] font-semibold text-slate-700 enabled:hover:underline disabled:cursor-default"
            >
              <Store className="h-3 w-3 shrink-0 text-slate-400" />
              <span className="truncate">{storeName}</span>
            </button>
          </div>
        )}
        <span
          className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-black ${badge.className}`}
        >
          <StatusIcon className="h-3 w-3" />
          {statusLabel}
        </span>
      </div>

      {/* Items */}
      <div className="px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {items.slice(0, 4).map((item, idx) => (
            <div key={`${item.id}-${idx}`} className="flex min-w-0 flex-1 items-center gap-2.5 sm:max-w-[300px]">
              <SafeImage
                src={item.image}
                alt={item.productName}
                className="h-12 w-12 shrink-0 rounded-lg border object-cover"
              />
              <div className="min-w-0">
                <div className="line-clamp-2 text-[12px] font-semibold leading-snug text-slate-800">
                  {item.productName}
                </div>
                {item.variant && (
                  <div className="truncate text-[10.5px] text-slate-500">{item.variant}</div>
                )}
                <div className="text-[10.5px] text-slate-500">
                  ×{item.quantity} · {bdt(item.unitPriceBDT * item.quantity)}
                </div>
              </div>
            </div>
          ))}
          {items.length > 4 && (
            <div className="flex items-center text-[11.5px] font-bold text-slate-500">
              +{items.length - 4} {lang === 'bn' ? 'আরও' : 'more'}
            </div>
          )}
        </div>

        {/* Tracking — only for live orders; a cancelled order shows its badge. */}
        {!badge.cancelled && (
          <div className="mt-3.5">
            <div className="flex items-center">
              {TRACKING_STEPS.map((step, i) => {
                const done = i <= stepIndex;
                return (
                  <React.Fragment key={step.key}>
                    <div className="flex flex-col items-center">
                      <span
                        className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black"
                        style={{
                          backgroundColor: done ? THEME.brand : '#eef0f4',
                          color: done ? '#fff' : '#94a3b8',
                        }}
                      >
                        {/*
                          * A completed step is a tick; a PENDING step is its
                          * ordinal. The final node used to fall through to a
                          * bare "4" — the last leg is the destination, so it
                          * gets a truck instead of a number.
                          */}
                        {done
                          ? <CheckCircle2 className="h-3.5 w-3.5" />
                          : i === TRACKING_STEPS.length - 1
                            ? <Truck className="h-3.5 w-3.5" />
                            : i + 1}
                      </span>
                      <span
                        className="mt-1 hidden whitespace-nowrap text-[9.5px] font-bold sm:block"
                        style={{ color: done ? THEME.ink : '#94a3b8' }}
                      >
                        {lang === 'bn' ? step.labelBn : step.label}
                      </span>
                    </div>
                    {i < TRACKING_STEPS.length - 1 && (
                      <span
                        className="mx-1 mb-4 h-0.5 flex-1 self-center rounded-full sm:mb-0"
                        style={{ backgroundColor: i < stepIndex ? THEME.brand : '#e8ecf1' }}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footer — payment + total */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5"
        style={{ borderColor: THEME.line }}
      >
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${payment.className}`}>
          {lang === 'bn' ? payment.labelBn : payment.label}
        </span>
        <div className="text-[12.5px] text-slate-500">
          {lang === 'bn' ? 'মোট' : 'Total'}{' '}
          <span className="text-[15px] font-black text-slate-900">{bdt(order.totalBDT)}</span>
        </div>
      </div>
    </article>
  );
};

export default MarketplaceOrdersView;
