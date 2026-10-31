import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, Truck, Wallet, CreditCard, Banknote, ShieldCheck,
  Loader2, CheckCircle2, Package, Store, MapPin, User, Phone, Mail,
  AlertCircle, ArrowRight,
} from 'lucide-react';
import SafeImage from './SafeImage';
import {
  useMarketplaceBasket,
  type BasketLine,
} from '../lib/useMarketplaceBasket';

/**
 * The UNIFIED marketplace checkout — `/marketplace/checkout`.
 *
 * ── Why this page exists ──────────────────────────────────────────────────
 * "Checkout" in the basket drawer used to call `onCheckout(vendorSlug)`, which
 * navigated to that merchant's own storefront and made the shopper re-enter
 * their details there. For a basket spanning three sellers that meant three
 * separate checkouts — and for the first vendor only, the other two items were
 * simply left behind.
 *
 * This page keeps the shopper inside the marketplace. It collects ONE delivery
 * address and ONE payment choice for the whole basket, then posts a single
 * master order whose lines each carry their selling vendor. The server
 * (`persistVendorChildren`) already fans that out into one child order per
 * merchant, each with its own commission and courier slip — so a seller sees
 * the order in `/dashboard/orders` immediately, with no manual re-search.
 *
 * ── What the shopper is shown ─────────────────────────────────────────────
 * A per-vendor split preview, because the biggest real risk in a multi-vendor
 * checkout is surprise delivery charges. The basket is grouped by store and
 * each group shows its own goods total; the delivery fee is charged ONCE for
 * the whole basket and then split proportionally on the server, which the
 * summary states plainly.
 */

const THEME = {
  bg: '#f6f7fb',
  surface: '#ffffff',
  ink: '#111827',
  line: '#e5e7eb',
  brand: '#3b2fd6',
  accent: '#ff9f1c',
  danger: '#e11d48',
  success: '#0f9d58',
} as const;

const bdt = (v: number) => `৳${Math.round(Number(v) || 0).toLocaleString('en-US')}`;

/** All 64 districts — a courier needs the real one, not a header shortcut. */
const DISTRICTS = [
  'Dhaka', 'Gazipur', 'Narayanganj', 'Manikganj', 'Munshiganj', 'Narsingdi', 'Tangail', 'Kishoreganj', 'Faridpur', 'Gopalganj', 'Madaripur', 'Rajbari', 'Shariatpur',
  'Chattogram', 'Cox’s Bazar', "Cox's Bazar", 'Cumilla', 'Brahmanbaria', 'Chandpur', 'Feni', 'Lakshmipur', 'Noakhali', 'Khagrachhari', 'Rangamati', 'Bandarban',
  'Rajshahi', 'Bogura', 'Joypurhat', 'Naogaon', 'Natore', 'Chapainawabganj', 'Pabna', 'Sirajganj',
  'Khulna', 'Bagerhat', 'Chuadanga', 'Jashore', 'Jhenaidah', 'Kushtia', 'Magura', 'Meherpur', 'Narail', 'Satkhira',
  'Barishal', 'Barguna', 'Bhola', 'Jhalokati', 'Patuakhali', 'Pirojpur',
  'Sylhet', 'Habiganj', 'Moulvibazar', 'Sunamganj',
  'Rangpur', 'Dinajpur', 'Gaibandha', 'Kurigram', 'Lalmonirhat', 'Nilphamari', 'Panchagarh', 'Thakurgaon',
  'Mymensingh', 'Jamalpur', 'Netrokona', 'Sherpur',
].filter((d, i, all) => all.indexOf(d) === i);

/**
 * Delivery charges, per district band.
 *
 * Deliberately explicit and shown to the shopper BEFORE they commit: a
 * marketplace that reveals delivery cost only on the final screen is the single
 * most common cause of abandoned checkout in this market. Charged once per
 * order, not once per vendor.
 */
const INSIDE_DHAKA = 60;
const OUTSIDE_DHAKA = 120;

type Lang = 'en' | 'bn';

type Session = { name: string; email: string; phone: string } | null;

function readSession(): Session {
  try {
    const raw = localStorage.getItem('zid_customer_session');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      name: String(parsed?.name || '').trim(),
      email: String(parsed?.email || '').trim(),
      phone: String(parsed?.phone || '').trim(),
    };
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

/** Group the basket by selling vendor — mirrors the server's split rule. */
function groupByVendor(lines: BasketLine[]) {
  const map = new Map<string, { vendorId: string; vendorName: string; vendorSlug: string; lines: BasketLine[]; subtotal: number }>();
  for (const line of lines) {
    const p = line.product as any;
    const id = String(p.vendor_id || p.vendor_slug || p.store_slug || 'unknown');
    const amount = (Number(p.priceBDT) || 0) * Number(line.quantity || 0);
    const existing = map.get(id);
    if (existing) {
      existing.lines.push(line);
      existing.subtotal += amount;
    } else {
      map.set(id, {
        vendorId: id,
        vendorName: String(p.vendor_name || 'Store'),
        vendorSlug: String(p.vendor_slug || ''),
        lines: [line],
        subtotal: amount,
      });
    }
  }
  return [...map.values()];
}

interface Props {
  onBack: () => void;
  /** Open the shopper's order history after a successful placement. */
  onOrderPlaced?: (orderId: string) => void;
  /** Sign in / open account when the shopper is a guest. */
  onSignIn?: () => void;
}

export const MarketplaceCheckoutView: React.FC<Props> = ({ onBack, onOrderPlaced, onSignIn }) => {
  const basket = useMarketplaceBasket();
  const [lang, setLang] = useState<Lang>(() => readLang());
  const [session, setSession] = useState<Session>(() => readSession());

  /**
   * HYDRATION GUARD — the "Your basket is empty" flash.
   *
   * `useMarketplaceBasket` seeds its state from storage in a lazy initialiser,
   * so the FIRST render already has the lines. This flag keeps the empty-state
   * card off screen until the basket hook has re-synced after mount, so a
   * shopper who arrived from the drawer never sees "Your basket is empty" for
   * a frame before their items appear.
   */
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), 0);
    return () => window.clearTimeout(id);
  }, []);

  /**
   * TELL THE MARKETPLACE THE BASKET WAS HANDED OVER.
   *
   * The drawer navigates here in the same tick as the click; the badge and any
   * other consumer re-read the persisted basket. Dispatching the same event the
   * basket hook listens to is what makes the handoff observable rather than
   * implicit, and it costs nothing when no line changed.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event('zid:marketplace-basket'));
  }, []);

  const t = useCallback((en: string, bn: string) => (lang === 'bn' ? bn : en), [lang]);

  // Own `<html lang>` while mounted, same contract as the other customer pages.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.setAttribute('data-owns-lang', 'checkout');
    document.documentElement.lang = lang;
    return () => { document.body.removeAttribute('data-owns-lang'); };
  }, [lang]);

  useEffect(() => {
    const sync = () => { setSession(readSession()); setLang(readLang()); };
    sync();
    window.addEventListener('focus', sync);
    return () => window.removeEventListener('focus', sync);
  }, []);

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    district: 'Dhaka',
    area: '',
    address: '',
    note: '',
  });
  const set = (key: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // Prefill from the shopper's session so a returning customer isn't retyping.
  useEffect(() => {
    if (!session) return;
    setForm((f) => ({
      ...f,
      name: f.name || session.name || '',
      phone: f.phone || session.phone || '',
      email: f.email || session.email || '',
    }));
  }, [session]);

  /** Cash on delivery for this market; card/bKash kept visible but marked. */
  const [payment, setPayment] = useState<'cod' | 'bkash' | 'card'>('cod');

  const [placing, setPlacing] = useState(false);
  /**
   * THE SUBMISSION LOCK.
   *
   * `placing` alone is NOT a guard against a double-click: React state updates
   * are asynchronous, so two clicks dispatched in the same tick both read
   * `placing === false` and both fire a request — producing two orders. This ref
   * is flipped SYNCHRONOUSLY before the first `await`, so the second click is
   * rejected immediately, and it is only released once the request settles.
   *
   * It also survives a re-render, unlike a state value captured in a closure.
   */
  const submittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<{ id: string; number: string; vendors: number } | null>(null);

  const vendors = useMemo(() => groupByVendor(basket.lines), [basket.lines]);
  const subtotal = basket.subtotal;
  const isInsideDhaka = form.district === 'Dhaka';
  const deliveryCharge = basket.itemCount === 0 ? 0 : (isInsideDhaka ? INSIDE_DHAKA : OUTSIDE_DHAKA);
  const total = subtotal + deliveryCharge;

  const validate = (): string | null => {
    if (basket.itemCount === 0) return t('Your basket is empty.', 'আপনার কার্ট খালি।');
    if (!form.name.trim()) return t('Please enter your full name.', 'অনুগ্রহ করে আপনার পুরো নাম লিখুন।');
    const digits = form.phone.replace(/\D/g, '');
    if (digits.length < 10) return t('Please enter a valid phone number.', 'অনুগ্রহ করে সঠিক ফোন নম্বর লিখুন।');
    if (!form.district) return t('Please choose your district.', 'অনুগ্রহ করে আপনার জেলা নির্বাচন করুন।');
    if (!form.area.trim()) return t('Please enter your area or thana.', 'অনুগ্রহ করে আপনার এলাকা বা থানা লিখুন।');
    if (!form.address.trim()) return t('Please enter your delivery address.', 'অনুগ্রহ করে আপনার ডেলিভারি ঠিকানা লিখুন।');
    return null;
  };

  /**
   * Place the order.
   *
   * The payload is a single MASTER order. Every line carries its `vendor_id` /
   * `vendor_slug` / `vendor_name`, which is exactly what the server needs to
   * group them into one child order per merchant. `split_by_vendor` is set
   * explicitly so the server splits even when the basket happens to contain a
   * single seller — that keeps one code path for every marketplace order.
   */
  const placeOrder = async () => {
    // Re-entrancy guard — checked and SET before any await. A second click
    // (or an Enter keypress on a focused button) is a no-op from here on.
    if (submittingRef.current) return;
    submittingRef.current = true;

    const problem = validate();
    if (problem) {
      submittingRef.current = false;
      setError(problem);
      return;
    }
    setError(null);
    setPlacing(true);

    try {
      const id = `MP-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const orderNumber = `ZID-${Date.now().toString().slice(-9)}`;

      const items = basket.lines.map((line, index) => {
        const p = line.product as any;
        return {
          id: `${id}-i${index + 1}`,
          productId: String(p.id || ''),
          productName: String(p.title || p.name || 'Item'),
          variant: String(p.variant || 'Standard'),
          quantity: Number(line.quantity || 1),
          unitPriceBDT: Number(p.priceBDT) || 0,
          image: String(p.image || ''),
          // ── the routing keys ──
          vendor_id: String(p.vendor_id || ''),
          vendor_name: String(p.vendor_name || ''),
          store_id: String(p.vendor_id || ''),
          store_slug: String(p.vendor_slug || ''),
          category: String(p.category || ''),
        };
      });

      // The master's own store fields are intentionally OMITTED: this order has
      // no single seller. The server falls back to a platform bucket for the
      // master row and routes each child to its own vendor.
      const payload = {
        id,
        orderNumber,
        customerName: form.name.trim(),
        customerPhone: form.phone.trim(),
        customerEmail: form.email.trim() || undefined,
        district: form.district,
        cityArea: form.area.trim(),
        address: form.address.trim(),
        customerNote: form.note.trim() || undefined,
        deliveryZone: isInsideDhaka ? 'Inside Dhaka' : 'Outside Dhaka',
        subtotalBDT: subtotal,
        deliveryCharge,
        totalBDT: total,
        paymentMethod: payment === 'cod' ? 'COD' : payment === 'bkash' ? 'bKash' : 'Bank Transfer',
        paymentStatus: 'Unpaid',
        fulfillmentStatus: 'Unfulfilled',
        status: 'New',
        source: 'Store',
        items,
        // Fan-out + provenance flags read by the server.
        split_by_vendor: true,
        order_source_channel: 'marketplace',
        marketplace_order: true,
      };

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ orders: [payload] }),
      });
      const data = await res.json().catch(() => null);

      // The API answers 200 with a skipped/duplicate marker for a repeat; only
      // an explicit failure should block the success screen.
      const failed = !res.ok || (data && data.ok === false);
      if (failed) {
        throw new Error(data?.error || data?.message || `Server responded ${res.status}`);
      }

      // The basket has been converted into an order — clear it so a refresh
      // cannot submit it twice.
      basket.clear();
      setPlaced({ id, number: orderNumber, vendors: vendors.length });
    } catch (e: any) {
      setError(
        t(
          `Could not place the order. ${e?.message || 'Please try again.'}`,
          `অর্ডার সম্পন্ন করা যায়নি। ${e?.message || 'আবার চেষ্টা করুন।'}`,
        ),
      );
    } finally {
      setPlacing(false);
      // Released only after the request has fully settled. On success the
      // component has already switched to the confirmation screen, so the
      // button no longer exists; on failure the shopper can retry.
      submittingRef.current = false;
    }
  };

  /* ───────────────────────────── success ───────────────────────────── */
  if (placed) {
    return (
      <div className="min-h-screen w-full font-sans" style={{ backgroundColor: THEME.bg }}>
        <main className="mx-auto max-w-[560px] px-4 py-14">
          <div className="rounded-2xl border bg-white p-8 text-center shadow-sm" style={{ borderColor: THEME.line }}>
            <span
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
              style={{ backgroundColor: '#e8f8ef' }}
            >
              <CheckCircle2 className="h-8 w-8" style={{ color: THEME.success }} />
            </span>
            <h1 className="mt-4 text-[20px] font-black text-slate-900">
              {t('Order placed successfully', 'অর্ডার সফলভাবে সম্পন্ন হয়েছে')}
            </h1>
            <p className="mt-1.5 text-[13px] text-slate-500">
              {t('Order number', 'অর্ডার নম্বর')}{' '}
              <span className="font-black text-slate-800">#{placed.number}</span>
            </p>
            <p className="mt-3 text-[12.5px] leading-relaxed text-slate-600">
              {placed.vendors > 1
                ? t(
                  `Your ${placed.vendors} sellers have each received their own copy of this order and will ship separately.`,
                  `আপনার ${placed.vendors}টি সেলার প্রত্যেকে আলাদা করে অর্ডারটি পেয়েছেন এবং আলাদাভাবে পাঠাবেন।`,
                )
                : t(
                  'The seller has received your order and will contact you to confirm delivery.',
                  'সেলার আপনার অর্ডার পেয়েছেন এবং ডেলিভারি নিশ্চিত করতে যোগাযোগ করবেন।',
                )}
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => onOrderPlaced?.(placed.id)}
                className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-5 text-[13px] font-black text-white"
                style={{ backgroundColor: THEME.brand }}
              >
                {t('View my orders', 'আমার অর্ডার দেখুন')}
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onBack}
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border px-5 text-[13px] font-bold text-slate-700"
                style={{ borderColor: THEME.line }}
              >
                {t('Continue shopping', 'কেনাকাটা চালিয়ে যান')}
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  /* ───────────────────────────── checkout ───────────────────────────── */
  return (
    <div className="min-h-screen w-full font-sans" style={{ backgroundColor: THEME.bg, color: THEME.ink }}>
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
          <h1 className="ml-auto flex items-center gap-2 text-[14px] font-black text-slate-900">
            <ShieldCheck className="h-4 w-4" style={{ color: THEME.brand }} />
            {t('Secure checkout', 'নিরাপদ চেকআউট')}
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] px-4 py-6">
        {!ready && basket.itemCount === 0 ? (
          <div className="flex items-center justify-center rounded-2xl border bg-white p-10 shadow-sm" style={{ borderColor: THEME.line }}>
            <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
          </div>
        ) : basket.itemCount === 0 ? (
          <div className="rounded-2xl border bg-white p-10 text-center shadow-sm" style={{ borderColor: THEME.line }}>
            <Package className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <div className="text-[15px] font-black text-slate-800">
              {t('Your basket is empty', 'আপনার কার্ট খালি')}
            </div>
            <p className="mt-1.5 text-[12.5px] text-slate-500">
              {t('Add products to your basket to check out.', 'চেকআউট করতে পণ্য কার্টে যোগ করুন।')}
            </p>
            <button
              type="button"
              onClick={onBack}
              className="mt-5 inline-flex min-h-[42px] items-center gap-2 rounded-xl px-5 text-[13px] font-black text-white"
              style={{ backgroundColor: THEME.brand }}
            >
              {t('Start shopping', 'কেনাকাটা শুরু করুন')}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
            {/* ── LEFT: delivery + payment ── */}
            <div className="space-y-4">
              {/* Delivery details */}
              <section className="overflow-hidden rounded-2xl border bg-white" style={{ borderColor: THEME.line }}>
                <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: THEME.line }}>
                  <Truck className="h-4 w-4" style={{ color: THEME.brand }} />
                  <h2 className="text-[13px] font-black text-slate-900">
                    {t('Delivery details', 'ডেলিভারির তথ্য')}
                  </h2>
                </div>
                <div className="grid gap-3 p-4 sm:grid-cols-2">
                  <Field
                    label={t('Full name', 'পুরো নাম')}
                    Icon={User}
                    value={form.name}
                    onChange={set('name')}
                    required
                  />
                  <Field
                    label={t('Mobile number', 'মোবাইল নম্বর')}
                    Icon={Phone}
                    value={form.phone}
                    onChange={set('phone')}
                    placeholder="01XXXXXXXXX"
                    inputMode="tel"
                    required
                  />
                  <Field
                    label={t('Email (optional)', 'ইমেইল (ঐচ্ছিক)')}
                    Icon={Mail}
                    value={form.email}
                    onChange={set('email')}
                    type="email"
                  />
                  <label className="block">
                    <span className="mb-1 flex items-center gap-1 text-[11px] font-bold text-slate-600">
                      <MapPin className="h-3 w-3" /> {t('District', 'জেলা')} *
                    </span>
                    <select
                      value={form.district}
                      onChange={set('district')}
                      className="w-full rounded-lg border px-3 py-2.5 text-[13px] text-slate-800 focus:border-[#3b2fd6] focus:outline-none"
                      style={{ borderColor: THEME.line }}
                    >
                      {DISTRICTS.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </label>
                  <Field
                    label={t('Area / Thana', 'এলাকা / থানা')}
                    Icon={MapPin}
                    value={form.area}
                    onChange={set('area')}
                    placeholder={t('e.g. Banani', 'যেমন: বনানী')}
                    required
                  />
                  <Field
                    label={t('Full delivery address', 'সম্পূর্ণ ডেলিভারি ঠিকানা')}
                    Icon={MapPin}
                    value={form.address}
                    onChange={set('address')}
                    placeholder={t('House / Road / Block', 'বাসা / রোড / ব্লক')}
                    required
                    wide
                  />
                  <label className="block sm:col-span-2">
                    <span className="mb-1 block text-[11px] font-bold text-slate-600">
                      {t('Delivery note (optional)', 'ডেলিভারি নোট (ঐচ্ছিক)')}
                    </span>
                    <textarea
                      value={form.note}
                      onChange={set('note')}
                      rows={2}
                      placeholder={t('Any instructions for the courier', 'কুরিয়ারের জন্য কোনো নির্দেশনা')}
                      className="w-full resize-none rounded-lg border px-3 py-2 text-[13px] text-slate-800 focus:border-[#3b2fd6] focus:outline-none"
                      style={{ borderColor: THEME.line }}
                    />
                  </label>
                </div>
              </section>

              {/* Payment */}
              <section className="overflow-hidden rounded-2xl border bg-white" style={{ borderColor: THEME.line }}>
                <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: THEME.line }}>
                  <Wallet className="h-4 w-4" style={{ color: THEME.brand }} />
                  <h2 className="text-[13px] font-black text-slate-900">
                    {t('Payment method', 'পেমেন্ট পদ্ধতি')}
                  </h2>
                </div>
                <div className="space-y-2 p-4">
                  {([
                    {
                      id: 'cod' as const,
                      Icon: Banknote,
                      title: t('Cash on Delivery', 'ক্যাশ অন ডেলিভারি'),
                      desc: t('Pay the courier when your order arrives.', 'পণ্য হাতে পাওয়ার পর কুরিয়ারকে টাকা দিন।'),
                      enabled: true,
                    },
                    {
                      id: 'bkash' as const,
                      Icon: Wallet,
                      title: 'bKash',
                      desc: t('Pay a merchant directly — one checkout per store.', 'সেলারের কাছে সরাসরি পরিশোধ করুন।'),
                      enabled: false,
                    },
                    {
                      id: 'card' as const,
                      Icon: CreditCard,
                      title: t('Credit / Debit card', 'ক্রেডিট / ডেবিট কার্ড'),
                      desc: t('Processed by the seller’s own gateway.', 'সেলারের নিজস্ব গেটওয়ে দ্বারা পরিচালিত।'),
                      enabled: false,
                    },
                  ]).map(({ id, Icon, title, desc, enabled }) => (
                    <label
                      key={id}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${enabled ? 'hover:bg-[#fafbff]' : 'cursor-not-allowed opacity-55'
                        }`}
                      style={{
                        borderColor: payment === id ? THEME.brand : THEME.line,
                        backgroundColor: payment === id ? '#f5f6ff' : '#fff',
                      }}
                    >
                      <input
                        type="radio"
                        name="payment"
                        checked={payment === id}
                        disabled={!enabled}
                        onChange={() => setPayment(id)}
                        className="mt-1 h-3.5 w-3.5 accent-[#3b2fd6]"
                      />
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                      <span className="min-w-0">
                        <span className="block text-[12.5px] font-bold text-slate-800">
                          {title}
                          {!enabled && (
                            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-black uppercase text-slate-500">
                              {t('At seller', 'সেলারের কাছে')}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{desc}</span>
                      </span>
                    </label>
                  ))}
                  <p className="flex items-start gap-1.5 pt-1 text-[10.5px] leading-relaxed text-slate-400">
                    <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
                    {t(
                      'Marketplace orders are paid on delivery. For bKash or card, complete payment with each seller after they confirm your order.',
                      'মার্কেটপ্লেসের অর্ডারে ডেলিভারির সময় পরিশোধ করুন। বিকাশ বা কার্ডের জন্য সেলার অর্ডার নিশ্চিত করার পর পরিশোধ করুন।',
                    )}
                  </p>
                </div>
              </section>
            </div>

            {/* ── RIGHT: summary ── */}
            <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
              <section className="overflow-hidden rounded-2xl border bg-white" style={{ borderColor: THEME.line }}>
                <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: THEME.line }}>
                  <h2 className="text-[13px] font-black text-slate-900">
                    {t('Order summary', 'অর্ডার সারাংশ')}
                  </h2>
                  <span className="text-[10.5px] font-bold text-slate-400">
                    {basket.itemCount} {t('items', 'পণ্য')}
                  </span>
                </div>

                <div className="max-h-[300px] overflow-y-auto px-4 py-3">
                  {vendors.map((vendor) => (
                    <div key={vendor.vendorId} className="mb-3 last:mb-0">
                      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">
                        <Store className="h-3 w-3" />
                        <span className="truncate">{vendor.vendorName}</span>
                        <span className="ml-auto shrink-0">{bdt(vendor.subtotal)}</span>
                      </div>
                      {vendor.lines.map((line) => {
                        const p = line.product as any;
                        return (
                          <div key={`${vendor.vendorId}-${p.id}`} className="mb-2 flex gap-2.5 last:mb-0">
                            <SafeImage
                              src={p.image}
                              alt={p.title || p.name || 'Item'}
                              className="h-11 w-11 shrink-0 rounded-lg border object-cover"
                            />
                            <div className="min-w-0 flex-1">
                              {/* `name` is the legacy fallback — a basket stored
                                  by an older build carries it instead of `title`,
                                  and rendering `undefined` left a blank row. */}
                              <div className="line-clamp-2 text-[11.5px] font-semibold leading-snug text-slate-800">
                                {p.title || p.name || 'Item'}
                              </div>
                              <div className="text-[10.5px] text-slate-500">
                                ×{line.quantity} · {bdt(Number(p.priceBDT) * line.quantity)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>

                <div className="space-y-1.5 border-t px-4 py-3 text-[12px]" style={{ borderColor: THEME.line }}>
                  <Row label={t('Subtotal', 'সাবটোটাল')} value={bdt(subtotal)} />
                  <Row
                    label={
                      isInsideDhaka
                        ? t('Delivery (inside Dhaka)', 'ডেলিভারি (ঢাকার ভিতরে)')
                        : t('Delivery (outside Dhaka)', 'ডেলিভারি (ঢাকার বাইরে)')
                    }
                    value={bdt(deliveryCharge)}
                  />
                  {vendors.length > 1 && (
                    <p className="pt-1 text-[10.5px] leading-relaxed text-slate-400">
                      {t(
                        `One delivery charge covers all ${vendors.length} sellers. Each seller ships separately with its own tracking number.`,
                        `একটি ডেলিভারি চার্জেই ${vendors.length}টি সেলারের পণ্য কভার হবে। প্রত্যেকে আলাদা ট্র্যাকিং নম্বর সহ পাঠাবেন।`,
                      )}
                    </p>
                  )}
                  <div className="flex items-center justify-between border-t pt-2" style={{ borderColor: THEME.line }}>
                    <span className="text-[13px] font-black text-slate-900">{t('Total', 'মোট')}</span>
                    <span className="text-[17px] font-black" style={{ color: THEME.ink }}>{bdt(total)}</span>
                  </div>
                </div>
              </section>

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[12px] text-rose-700">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={placeOrder}
                // Belt and braces: the ref blocks same-tick double clicks, the
                // disabled state blocks the UI and removes the button from the
                // tab order while a request is in flight.
                disabled={placing}
                aria-busy={placing}
                aria-disabled={placing}
                className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl text-[13.5px] font-black text-white transition disabled:opacity-60"
                style={{ backgroundColor: THEME.brand }}
              >
                {placing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('Placing your order…', 'অর্ডার সম্পন্ন হচ্ছে…')}
                  </>
                ) : (
                  <>
                    {t('Place order', 'অর্ডার করুন')} · {bdt(total)}
                  </>
                )}
              </button>

              {!session && (
                <button
                  type="button"
                  onClick={() => onSignIn?.()}
                  className="w-full text-center text-[11.5px] font-semibold text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-slate-800"
                >
                  {t('Sign in to save your details for next time', 'পরেরবারের জন্য তথ্য সংরক্ষণ করতে সাইন ইন করুন')}
                </button>
              )}

              <p className="px-1 text-center text-[10.5px] leading-relaxed text-slate-400">
                {t(
                  'By placing this order you agree to our Terms of Use. Prices include VAT where applicable.',
                  'অর্ডার করার মাধ্যমে আপনি আমাদের ব্যবহারের শর্তাবলীতে সম্মত হচ্ছেন। প্রযোজ্য ক্ষেত্রে মূল্যে ভ্যাট অন্তর্ভুক্ত।',
                )}
              </p>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
};

/* ───────────────────────────── small parts ───────────────────────────── */

const Field: React.FC<{
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  wide?: boolean;
  inputMode?: 'tel' | 'text' | 'email';
}> = ({ label, Icon, value, onChange, type = 'text', placeholder, required, wide, inputMode }) => (
  <label className={`block ${wide ? 'sm:col-span-2' : ''}`}>
    <span className="mb-1 flex items-center gap-1 text-[11px] font-bold text-slate-600">
      <Icon className="h-3 w-3" /> {label}{required ? ' *' : ''}
    </span>
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      inputMode={inputMode}
      className="w-full rounded-lg border px-3 py-2.5 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-[#3b2fd6] focus:outline-none"
      style={{ borderColor: THEME.line }}
    />
  </label>
);

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between">
    <span className="text-slate-500">{label}</span>
    <span className="font-bold text-slate-800">{value}</span>
  </div>
);

export default MarketplaceCheckoutView;
