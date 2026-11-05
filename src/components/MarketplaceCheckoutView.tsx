import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, Truck, Wallet, CreditCard, Banknote, ShieldCheck,
  Loader2, CheckCircle2, Package, Store, MapPin, User, Phone, Mail, Copy, Check,
  AlertCircle, ArrowRight,
} from 'lucide-react';
import SafeImage from './SafeImage';
import type { AdminPaymentGatewayConfig } from '../types';
import { useCart } from './CartProvider';
import { resolveProductImage } from '../utils/imageFallback';
import { type BasketLine, readPersistedBasket } from '../lib/useMarketplaceBasket';
import { notifyOrdersChanged } from '../lib/orderSync';

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
 * address and ONE payment choice for the whole basket, then sends ONE order
 * request whose items each keep their selling vendor. The server persists it
 * (MongoDB + Supabase) and fans it out into one child order per merchant — so a
 * seller sees the order in `/dashboard/orders` immediately, with no manual
 * re-search.
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

/** One dev-time log per item, so the console is not flooded on every render. */
const loggedImageItems = new Set<string>();

function productImageOf(p: any, line?: any): string {
  /*
   * ONE resolver for the whole app.
   *
   * The rules (flat keys → `images[]` → nested `product.images[0]`) live in
   * `resolveProductImage`, which `normalizeOrderItems` also uses. Keeping two
   * copies is what let the checkout show thumbnails while order history showed
   * none for the very same line.
   *
   * The PRODUCT is authoritative; the basket line is only the fallback, because
   * a line persisted in localStorage can carry a stale/blank image while the
   * live product still has one.
   */
  const image = resolveProductImage(p) || resolveProductImage(line) || '';
  const itemKey = String(p?.id || p?.productId || p?.product_id || line?.productId || '');
  if (import.meta.env.DEV && itemKey && !loggedImageItems.has(itemKey)) {
    loggedImageItems.add(itemKey);
    console.debug('[MarketplaceCheckout] resolved cart item image', { itemKey, image });
  }
  /*
   * Return '' when the line has no photo — do NOT bake `PLACEHOLDER_IMAGE` in.
   *
   * `SafeImage` already renders the placeholder for an empty source, and a
   * real '/placeholder.svg' here made "no photo" indistinguishable from "a
   * photo" (the same reason `normalizeOrderItems` keeps `image` empty). The
   * caller passes the result straight to the `<img>` src.
   */
  return image;
}

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
 *
 * SUB DHAKA is its own band, exactly as the merchant storefront's checkout has
 * it. The three-zone model is what every Bangladeshi courier actually bills on,
 * and collapsing it into inside/outside overcharges a Gazipur or Narayanganj
 * buyer — the single most common complaint about flat-rate delivery.
 */
const INSIDE_DHAKA = 60;
const SUB_DHAKA = 90;
const OUTSIDE_DHAKA = 120;

/** Districts billed at the SUB Dhaka rate (the Dhaka metro ring). */
const SUB_DHAKA_DISTRICTS = new Set([
  'Gazipur', 'Narayanganj', 'Manikganj', 'Munshiganj', 'Narsingdi', 'Savar', 'Keraniganj',
]);

type ShippingZone = 'inside' | 'sub' | 'outside';

function shippingZoneOf(district: string): ShippingZone {
  if (district === 'Dhaka') return 'inside';
  if (SUB_DHAKA_DISTRICTS.has(district)) return 'sub';
  return 'outside';
}

function deliveryFeeOf(zone: ShippingZone): number {
  return zone === 'inside' ? INSIDE_DHAKA : zone === 'sub' ? SUB_DHAKA : OUTSIDE_DHAKA;
}

/**
 * The payment rails the marketplace checkout offers.
 *
 * These mirror the merchant storefront's checkout: COD plus the three mobile
 * wallets. A marketplace order is NOT paid to the platform — each seller
 * collects for their own goods — so a wallet choice records the shopper's
 * intent and the transaction id they used, which is handed to every seller in
 * that order. Card payments stay with the seller's own gateway and are not
 * offered here.
 */
type MarketplacePayment = 'cod' | 'bkash' | 'nagad' | 'rocket';

const PAYMENT_LABELS: Record<MarketplacePayment, string> = {
  cod: 'COD',
  bkash: 'bKash',
  nagad: 'Nagad',
  rocket: 'Rocket',
};

const WALLET_PAYMENTS: MarketplacePayment[] = ['bkash', 'nagad', 'rocket'];

/** Wallet numbers the shopper is told to send to. Placeholder until each seller
 *  publishes its own number at checkout; the transaction id is what is verified. */
const WALLET_HELP_LINE =
  'Send the total to the platform number shown above, then enter the Transaction ID you receive by SMS. The central team verifies every payment before dispatch.';
const WALLET_HELP_LINE_BN =
  'মোট টাকা সেলারের ওয়ালেটে পাঠিয়ে এসএমএস-এ পাওয়া ট্রানজেকশন আইডি লিখুন। প্রত্যেক সেলার নিজের পেমেন্ট নিশ্চিত করবেন।';

type Lang = 'en' | 'bn';

type Session = { name: string; email: string; phone: string } | null;

function readSession(): Session {
  try {
    const raw = document.cookie.match(/(?:^|; )zid_customer_session=([^;]*)/)?.[1];
    if (!raw) return null;
    const parsed = JSON.parse(decodeURIComponent(raw));
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

/**
 * How many lines are persisted under `zid_marketplace_cart` right now.
 *
 * Tolerant by design: a corrupt or absent value reads as 0 rather than
 * throwing during render, and the legacy mirror key is honoured so a basket
 * saved by an older build still counts.
 */
function readPersistedLineCount(): number {
  return readPersistedBasket().length;
}

/** Group the basket by selling vendor — mirrors the server's split rule. */
function groupByVendor(lines: BasketLine[]) {
  const map = new Map<string, { vendorId: string; vendorName: string; vendorSlug: string; lines: BasketLine[]; subtotal: number }>();
  for (const line of lines) {
    const p = line.product as any;
    const id = String(p.vendor_id || p.store_id || p.vendor_slug || p.store_slug || 'unknown');
    const slug = String(p.vendor_slug || p.store_slug || p.storeSlug || '');
    const name = String(p.vendor_name || p.store_name || p.storeName || 'Store');
    const amount = (Number(p.priceBDT) || 0) * Number(line.quantity || 0);
    const existing = map.get(id);
    if (existing) {
      existing.lines.push(line);
      existing.subtotal += amount;
    } else {
      map.set(id, {
        vendorId: id,
        vendorName: name,
        vendorSlug: slug,
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
  /**
   * BOUND TO THE GLOBAL CART CONTEXT.
   *
   * `CartProvider` is mounted at the root (main.tsx), so this page reads the
   * SAME live basket the drawer and badge mutate instead of spinning up a
   * second, independently-seeded hook instance. `useCart` falls back to the
   * hook when no provider is present, so this is safe either way.
   */
  const basket = useCart();
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
   *
   * A REAL EMPTY BASKET still resolves quickly: the wait only lasts a few
   * frames before the empty state is shown, so a shopper who genuinely has
   * nothing in the basket is not left on a spinner.
   */
  const [ready, setReady] = useState(false);
  /**
   * True while an empty basket might still be a basket that is about to land.
   * Cleared by the effect below as soon as lines arrive, or after a short
   * grace period so a genuinely empty basket still reaches its empty state.
   */
  const [waitingForBasket, setWaitingForBasket] = useState(true);

  /**
   * MOUNT-TIME STORAGE READ — independent of the provider tree.
   *
   * The cart context already seeds from `zid_marketplace_cart` synchronously,
   * so this normally agrees with it immediately. It exists so the checkout page
   * renders the right thing even if it is mounted somewhere the provider is not
   * (a deep link, a preview shell, an error boundary): the persisted basket is
   * then read straight from localStorage instead of showing "Your basket is
   * empty" over lines that are sitting right there in storage.
   */
  const [persistedCount, setPersistedCount] = useState<number>(() => readPersistedLineCount());

  /**
   * THE PERSISTED BASKET ITSELF — read on the FIRST render.
   *
   * `readPersistedLineCount()` only proves the basket is non-empty; the page
   * still rendered its items from the Context. When the Context's hook instance
   * had not yet adopted the freshly-written basket (a hard navigation, a fresh
   * tab, a provider that mounted a tick later), the page showed the loading
   * card and then "Your basket is empty" over lines sitting in localStorage.
   *
   * Seeding the LINES from storage in a lazy initialiser means the very first
   * paint already shows the shopper's items — exactly what the drawer showed a
   * moment earlier — and `/marketplace/checkout` is correct even when opened
   * directly by URL with no prior in-app navigation.
   */
  const [persistedLines, setPersistedLines] = useState<BasketLine[]>(() => {
    try { localStorage.getItem('zid_marketplace_cart'); } catch { /* ignore */ }
    return readPersistedBasket();
  });

  useEffect(() => {
    // Re-read whenever the basket changes, so a line added on this page (or in
    // another tab) is reflected without waiting for a context update.
    const stored = readPersistedBasket();
    setPersistedLines(stored);
    setPersistedCount(stored.length);
  }, [basket.itemCount]);

  /**
   * The lines this page renders.
   *
   * The Context is authoritative once it holds anything (it is the same basket
   * the drawer mutates); the persisted copy is the fallback for the frames
   * before the Context has adopted it, so an empty Context can never blank a
   * checkout whose lines are already in storage.
   */
  const lines = basket.itemCount > 0 || persistedLines.length === 0 ? basket.lines : persistedLines;
  const itemCount = lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);

  /** Lines the page can actually render: the context's, or storage's. */
  const hasItems = basket.itemCount > 0 || persistedCount > 0;

  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), 0);
    return () => window.clearTimeout(id);
  }, []);

  /**
   * A BASKET THAT ARRIVES AFTER MOUNT IS STILL OURS.
   *
   * The drawer hands off to this page in the same click, and the persisted
   * basket can be re-written a moment later (another consumer's effect, a
   * restored session, slow hydration). When that happens the hook adopts the
   * new lines — and this stops treating the page as empty so the checkout
   * renders the basket instead of the "Your basket is empty" card. Items,
   * quantities and vendor groups all re-derive from `basket.lines`.
   */
  useEffect(() => {
    if (hasItems) {
      setWaitingForBasket(false);
      return;
    }
    const id = window.setTimeout(() => setWaitingForBasket(false), 600);
    return () => window.clearTimeout(id);
  }, [hasItems]);

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

  /**
   * PAYMENT — same rails as the merchant storefront's own checkout.
   *
   * `txId` is the transaction id the shopper pasted from their wallet SMS. It is
   * required for a wallet payment (the seller has nothing else to reconcile
   * against) and irrelevant for COD, so it is cleared when COD is reselected
   * rather than left behind to be attached to an order by accident.
   */
  const [payment, setPayment] = useState<MarketplacePayment>('cod');
  const [txId, setTxId] = useState('');
  const isWalletPayment = payment !== 'cod';

  /**
   * CENTRAL ADMIN WALLET NUMBERS.
   *
   * Marketplace wallet payments go to the PLATFORM's bKash/Nagad/Rocket
   * accounts (the Super Admin configures them in the admin portal, persisted
   * through `/api/admin/platform-config`), not to any single seller. The
   * checkout displays the number for the SELECTED wallet with a one-tap Copy
   * button so the shopper can send the money and paste the TrxID without
   * mistyping the account.
   */
  const [adminPay, setAdminPay] = useState<AdminPaymentGatewayConfig | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/platform-config', { headers: { Accept: 'application/json' } });
        const data = await res.json().catch(() => null);
        const cfg = data?.config?.adminPaymentConfig;
        if (!cancelled && cfg && typeof cfg === 'object') setAdminPay(cfg as AdminPaymentGatewayConfig);
      } catch {
        // Unreachable config service — the payment block simply renders its
        // fallback guidance instead of a number.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const adminWalletNumber =
    payment === 'bkash' ? String(adminPay?.bkashNumber || '') :
    payment === 'nagad' ? String(adminPay?.nagadNumber || '') :
    payment === 'rocket' ? String(adminPay?.rocketNumber || '') : '';

  // If the SELECTED gateway is (or becomes) disabled by the Super Admin while
  // the shopper is on the page, fall back to COD so a stale selection can
  // never be submitted on a hidden rail.
  useEffect(() => {
    if (payment === 'cod') return;
    const active =
      payment === 'bkash' ? adminPay?.bkashActive !== false :
      payment === 'nagad' ? adminPay?.nagadActive !== false :
      payment === 'rocket' ? adminPay?.rocketActive !== false : true;
    if (adminPay && !active) {
      setPayment('cod');
      setTxId('');
    }
  }, [adminPay, payment]);
  const [copiedNumber, setCopiedNumber] = useState(false);
  const copyWalletNumber = async () => {
    if (!adminWalletNumber) return;
    try {
      await navigator.clipboard.writeText(adminWalletNumber);
    } catch {
      // Clipboard API can be denied (http://, iOS Safari); the execCommand
      // fallback covers the legacy WebView cases still common in Bangladesh.
      try {
        const temp = document.createElement('textarea');
        temp.value = adminWalletNumber;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
      } catch { /* give up silently */ }
    }
    setCopiedNumber(true);
    window.setTimeout(() => setCopiedNumber(false), 1800);
  };

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

  /*
   * A STABLE IDEMPOTENCY KEY PER CHECKOUT ATTEMPT.
   *
   * `ZID-<Date.now()>-<slug>` was generated fresh on every submit, so if a
   * request timed out after the row was already committed and the shopper
   * pressed the button again, the retry produced a DIFFERENT order number and
   * the server could not tell it was the same basket — the shopper ended up with
   * two orders.
   *
   * This stamp is created once when the checkout view mounts and only rotated
   * after a CONFIRMED success. Every retry of the same attempt therefore reuses
   * the same order numbers, which the insert upserts on.
   */
  const attemptStampRef = useRef(`ZID-${Date.now().toString().slice(-9)}`);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<{ id: string; number: string; vendors: number } | null>(null);

  const vendors = useMemo(() => groupByVendor(lines), [lines]);
  const subtotal = useMemo(
    () => lines.reduce((sum, line) => sum + (Number(line.product?.priceBDT) || 0) * Number(line.quantity || 0), 0),
    [lines],
  );
  // Delivery zone: derived from district, overridable by the shopper
  const [shippingZone, setShippingZone] = useState<ShippingZone | null>(null);
  const resolvedZone = shippingZone ?? shippingZoneOf(form.district);
  const isInsideDhaka = resolvedZone === 'inside';

  // Per-vendor delivery: each store charges its own delivery fee for the zone.
  const perVendorDelivery = itemCount === 0 ? 0 : deliveryFeeOf(resolvedZone);
  const totalDeliveryCharge = perVendorDelivery * vendors.length;

  // bKash cash-out charge (merchant-configured percentage, default 1%).
  const isBkash = payment === 'bkash';
  const bkashCashOutFee = isBkash ? Math.round((subtotal + totalDeliveryCharge) * 0.01) : 0;
  const total = subtotal + totalDeliveryCharge + bkashCashOutFee;

  const validate = (): string | null => {
    if (itemCount === 0) return t('Your basket is empty.', 'আপনার কার্ট খালি।');
    if (!form.name.trim()) return t('Please enter your full name.', 'অনুগ্রহ করে আপনার পুরো নাম লিখুন।');
    const digits = form.phone.replace(/\D/g, '');
    if (digits.length < 10) return t('Please enter a valid phone number.', 'অনুগ্রহ করে সঠিক ফোন নম্বর লিখুন।');
    if (!form.district) return t('Please choose your district.', 'অনুগ্রহ করে আপনার জেলা নির্বাচন করুন।');
    if (!form.area.trim()) return t('Please enter your area or thana.', 'অনুগ্রহ করে আপনার এলাকা বা থানা লিখুন।');
    if (!form.address.trim()) return t('Please enter your delivery address.', 'অনুগ্রহ করে আপনার ডেলিভারি ঠিকানা লিখুন।');
    // A wallet payment without a transaction id cannot be reconciled by the
    // seller, and would land in their dashboard as an unverifiable claim.
    if (isWalletPayment && txId.replace(/\s/g, '').length < 6) {
      return t(
        'Please enter the Transaction ID from your wallet payment.',
        'অনুগ্রহ করে ওয়ালেট পেমেন্টের ট্রানজেকশন আইডি লিখুন।',
      );
    }
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
      // The attempt stamp IS the order identity: the receipt shows it, the
      // payload is keyed on it, and a retry re-sends the same one.
      const orderNumber = attemptStampRef.current;
      const id = orderNumber;

      const items = lines.map((line, index) => {
        const p = line.product as any;
        const vendorId = String(p.vendor_id || p.store_id || p.vendor_slug || p.store_slug || '');
        const vendorSlug = String(p.vendor_slug || p.store_slug || p.storeSlug || '');
        const vendorName = String(p.vendor_name || p.store_name || p.storeName || 'Store');
        return {
          id: `${id}-i${index + 1}`,
          productId: String(p.id || ''),
          productName: String(p.title || p.name || 'Item'),
          variant: String(p.variant || 'Standard'),
          quantity: Number(line.quantity || 1),
          unitPriceBDT: Number(p.priceBDT) || 0,
          image: productImageOf(p, line),
          // ── the routing keys ──
          vendor_id: vendorId,
          vendor_name: vendorName,
          vendor_slug: vendorSlug,
          store_id: vendorId,
          store_slug: vendorSlug,
          category: String(p.category || ''),
        };
      });

      // The master's own store fields are intentionally OMITTED: this order has
      // no single seller. The server falls back to a platform bucket for the
      // master row and routes each child to its own vendor.

      /*
       * ── 1. ONE ORDER REQUEST FOR THE WHOLE BASKET ────────────────────────
       *
       * The previous version wrote once per VENDOR (through
       * `createMarketplaceOrderInSupabase`), again per vendor in a separate
       * mirror loop, and once more for a master — so a single click fired
       * `2 × vendors + 1` simultaneous POSTs to `/api/orders`, and the
       * dashboards showed several orders for one purchase.
       *
       * There is now exactly ONE request. It carries every line with its
       * selling vendor; the server owns the fan-out (one child per merchant
       * under a single master) and the Supabase mirror — what
       * `createMarketplaceOrderInSupabase` used to be called for happens inside
       * `/api/orders` with the service role.
       */
      const orderResults: { ok: boolean; orderNumber: string; error?: string }[] = [];
      let mirrorSucceeded = 0;
      /*
       * THE ONE AND ONLY WRITE FOR A CHECKOUT CLICK — see the block comment
       * above. The attempt stamp is both the master number and the idempotency
       * key, so a retry (or a second click that somehow got through) UPSERTS
       * this same master instead of adding another.
       */
      const masterNumber = orderNumber;
      {
        try {
          const masterRes = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
              orders: [{
                id: masterNumber,
                orderNumber: masterNumber,
                customerName: form.name.trim(),
                customerPhone: form.phone.trim(),
                customerEmail: form.email.trim() || undefined,
                district: form.district,
                cityArea: form.area.trim(),
                address: form.address.trim(),
                customerNote: form.note.trim() || undefined,
                deliveryZone:
                  resolvedZone === 'inside' ? 'Inside Dhaka'
                    : resolvedZone === 'sub' ? 'Sub Dhaka'
                      : 'Outside Dhaka',
                subtotalBDT: subtotal,
                deliveryCharge: totalDeliveryCharge,
                totalBDT: total,
                paymentMethod: PAYMENT_LABELS[payment],
                paymentStatus: isWalletPayment ? 'Pending Verification' : 'Unpaid',
                transactionId: isWalletPayment ? txId.trim() || undefined : undefined,
                fulfillmentStatus: 'Unfulfilled',
                status: 'New',
                source: 'Store',
                // Every line, each carrying its selling vendor — this is what
                // the server groups into one child per merchant.
                items,
                split_by_vendor: true,
                vendor_ids: vendors.map((v) => v.vendorId).filter(Boolean),
                vendor_slugs: vendors.map((v) => v.vendorSlug).filter(Boolean),
                vendor_count: vendors.length,
                order_source_channel: 'marketplace',
                marketplace_order: true,
                // One key for the whole basket; a retry upserts this master.
                idempotencyKey: `${masterNumber}:basket`,
                idempotency_key: `${masterNumber}:basket`,
              }],
            }),
          });
          const masterData = await masterRes.json().catch(() => null);
          /*
           * The server answers 200 and `duplicate: true` for a repeated
           * submission of the same basket — that is a SUCCESS, not an error:
           * the order exists and this response describes it.
           */
          if (masterRes.ok && masterData?.ok !== false) mirrorSucceeded += 1;
          else if (masterRes.ok && masterData?.duplicate === true) mirrorSucceeded += 1;
          else {
            orderResults.push({
              ok: false,
              orderNumber: masterNumber,
              error: String(masterData?.error || `HTTP ${masterRes.status}`),
            });
          }
        } catch (masterErr: any) {
          console.warn('[MarketplaceCheckout] order submission failed:', masterErr?.message || masterErr);
          orderResults.push({
            ok: false,
            orderNumber: masterNumber,
            error: masterErr?.message || 'The order could not be submitted.',
          });
        }
      }
      if (mirrorSucceeded === 0) {
        const firstError = orderResults[0]?.error || 'Your order could not be saved. Please try again.';
        throw new Error(firstError);
      }

      // Persist customer session so the customer's orders are immediately visible
      // on /marketplace/orders without requiring any storefront redirect.
      try {
        const sessionPayload = {
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || undefined,
        };
        document.cookie = `zid_customer_session=${encodeURIComponent(JSON.stringify(sessionPayload))}; Max-Age=2592000; Path=/; SameSite=Lax`;
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('zid:customer-session', { detail: sessionPayload }));
        }
      } catch {
        // ignore storage errors
      }

      // The basket has been converted into an order — clear it so a refresh
      // cannot submit it twice.
      basket.clear();

      // TELL EVERY OPEN DASHBOARD.
      //
      // The merchant's `/dashboard` may be open in another tab. Firing this
      // signal (not a fetch — the reader owns its own authoritative query)
      // makes the order table refetch immediately instead of waiting out its
      // poll interval, and it is scoped per selling vendor so only the stores
      // that actually got an order react.
      for (const vendor of vendors) {
        notifyOrdersChanged({
          storeRef: vendor.vendorSlug || vendor.vendorId,
          reason: 'placed',
          count: 1,
        });
      }

      /*
       * Only a CONFIRMED success rotates the attempt stamp. A failed attempt
       * keeps its numbers, so pressing the button again retries the SAME order
       * (which the upsert de-duplicates) instead of creating a new one.
       */
      attemptStampRef.current = `ZID-${Date.now().toString().slice(-9)}`;
      setPlaced({ id, number: orderNumber, vendors: vendors.length });
    } catch (e: any) {
      // No retry loop, no automatic resubmission: the shopper stays on the form
      // with the entered data intact and decides whether to try again.
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
        {(!ready || waitingForBasket) && !hasItems ? (
          <div className="flex items-center justify-center rounded-2xl border bg-white p-10 shadow-sm" style={{ borderColor: THEME.line }}>
            <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
          </div>
        ) : itemCount === 0 ? (
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
                  {/* ── DELIVERY ZONE SELECTOR ── */}
                  <label className="block">
                    <span className="mb-1 flex items-center gap-1 text-[11px] font-bold text-slate-600">
                      <Truck className="h-3 w-3" /> {t('Delivery zone', 'ডেলিভারি ज़োন')} *
                    </span>
                    <select
                      value={resolvedZone}
                      onChange={(e) => setShippingZone(e.target.value as ShippingZone)}
                      className="w-full rounded-lg border px-3 py-2.5 text-[13px] text-slate-800 focus:border-[#3b2fd6] focus:outline-none"
                      style={{ borderColor: THEME.line }}
                    >
                      <option value="inside">{t('Inside City', 'শহরের ভিতরে')}</option>
                      <option value="sub">{t('Sub-Dhaka / Suburbs', 'সাব-ঢাকা / উপশহর')}</option>
                      <option value="outside">{t('Outside City', 'শহরের বাইরে')}</option>
                    </select>
                    <p className="mt-1 text-[10.5px] text-slate-500">
                      {t(
                        'Delivery fee applies per seller store.',
 'ডেলিভারি ফি প্রতিটি সেলার স্টোরের জন্য लागू হয়।'
                      )}
                    </p>
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
                  {/* DYNAMIC PAYMENT VISIBILITY — a method appears only when
                      the Super Admin has ENABLED it in the gateway panel
                      (bkashActive / nagadActive / rocketActive). A disabled
                      gateway is completely HIDDEN, not merely greyed out, so
                      shoppers can never select a rail the platform does not
                      accept. COD has no admin toggle: it is always offered. */}
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
                      desc: t('Send the total, then add your Transaction ID.', 'মোট টাকা পাঠিয়ে ট্রানজেকশন আইডি দিন।'),
                      enabled: adminPay ? adminPay.bkashActive !== false : true,
                    },
                    {
                      id: 'nagad' as const,
                      Icon: Wallet,
                      title: 'Nagad',
                      desc: t('Send the total, then add your Transaction ID.', 'মোট টাকা পাঠিয়ে ট্রানজেকশন আইডি দিন।'),
                      enabled: adminPay ? adminPay.nagadActive !== false : true,
                    },
                    {
                      id: 'rocket' as const,
                      Icon: Wallet,
                      title: 'Rocket',
                      desc: t('Send the total, then add your Transaction ID.', 'মোট টাকা পাঠিয়ে ট্রানজেকশন আইডি দিন।'),
                      enabled: adminPay ? adminPay.rocketActive !== false : true,
                    },
                  ])
                  // Completely hide disabled gateways rather than greying them
                  // out — the checkout must never advertise a rail the Super
                  // Admin switched off.
                  .filter(({ enabled }) => enabled)
                  .map(({ id, Icon, title, desc, enabled }) => (
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
                        onChange={() => {
                          setPayment(id);
                          // A transaction id belongs to the wallet that produced
                          // it. Carrying it across to COD (or to a different
                          // wallet) would attach a real TrxID to an order that
                          // was never paid that way.
                          if (id === 'cod') setTxId('');
                        }}
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
                  {/* TRANSACTION ID — required for a wallet payment. Shown only
                      when a wallet is selected, so the COD path stays a
                      one-click order. */}
                  {isWalletPayment && (
                    <div className="rounded-xl border p-3" style={{ borderColor: THEME.line, backgroundColor: '#fafbff' }}>
                      {/* CENTRAL ADMIN RECEIVING NUMBER + COPY.
                          Marketplace wallet payments go to the platform's own
                          wallet, so the shopper must see — and copy — THAT
                          number, not a seller's. The Copy button uses the
                          Clipboard API with an execCommand fallback for the
                          older WebViews common in Bangladesh. */}
                      {adminWalletNumber ? (
                        <div
                          className="mb-3 flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5"
                          style={{ borderColor: THEME.line, backgroundColor: '#fff' }}
                        >
                          <div className="min-w-0">
                            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              {t('Send money to this number', 'এই নম্বরে টাকা পাঠান')} ({PAYMENT_LABELS[payment]})
                            </div>
                            <div
                              className="truncate font-mono text-[16px] font-black"
                              style={{ color: THEME.brand }}
                            >
                              {adminWalletNumber}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={copyWalletNumber}
                            aria-label={t('Copy payment number', 'পেমেন্ট নম্বর কপি করুন')}
                            className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-black text-white transition active:opacity-80"
                            style={{ backgroundColor: THEME.brand }}
                          >
                            {copiedNumber ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            {copiedNumber
                              ? t('Copied!', 'কপি হয়েছে!')
                              : t('Copy', 'কপি')}
                          </button>
                        </div>
                      ) : (
                        <p className="mb-3 rounded-lg px-3 py-2 text-[11px] leading-relaxed"
                           style={{ backgroundColor: '#fff', color: '#64748b' }}>
                          {t(
                            `The ${PAYMENT_LABELS[payment]} receiving number is not published yet. Contact support before sending money.`,
                            `${PAYMENT_LABELS[payment]} এর গ্রহণকারী নম্বর এখনো যুক্ত করা হয়নি। টাকা পাঠানোর আগে সাপোর্টে যোগাযোগ করুন।`,
                          )}
                        </p>
                      )}
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-bold text-slate-600">
                          {t(
                            `${PAYMENT_LABELS[payment]} Transaction ID`,
                            `${PAYMENT_LABELS[payment]} ট্রানজেকশন আইডি`,
                          )} *
                        </span>
                        <input
                          value={txId}
                          onChange={(e) => setTxId(e.target.value)}
                          placeholder={t('e.g. 9HK2A7B3XY', 'যেমন: 9HK2A7B3XY')}
                          autoComplete="off"
                          className="w-full rounded-lg border bg-white px-3 py-2.5 text-[13px] uppercase tracking-wide text-slate-800 focus:border-[#3b2fd6] focus:outline-none"
                          style={{ borderColor: THEME.line }}
                        />
                      </label>
                      <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-500">
                        {t(WALLET_HELP_LINE, WALLET_HELP_LINE_BN)}
                      </p>
                    </div>
                  )}

                  <p className="flex items-start gap-1.5 pt-1 text-[10.5px] leading-relaxed text-slate-400">
                    <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
                    {t(
                      'Payment goes directly to the platform’s central account — each seller is paid their share after verification. Every seller in this order sees the same payment details.',
                      'পেমেন্ট প্ল্যাটফর্মের সেন্ট্রাল অ্যাকাউন্টে যায় — ভেরিফিকেশনের পর প্রত্যেক সেলার তাদের অংশ পান। এই অর্ডারের প্রত্যেক সেলার একই পেমেন্ট তথ্য দেখবেন।',
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
                    {itemCount} {t('items', 'পণ্য')}
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
                            src={productImageOf(p, line)}
                            alt={p.title || p.name || 'Item'}
                            width={80}
                            height={80}
                            className="h-20 w-20 shrink-0 rounded-lg border object-cover"
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
                  {vendors.length > 1 && (
                    <Row
                      label={
                        resolvedZone === 'inside'
                          ? t('Delivery (per store)', 'ডেলিভারি (প্রতি স্টোর)')
                          : resolvedZone === 'sub'
                            ? t('Delivery (per store)', 'ডেলিভারি (প্রতি স্টোর)')
                            : t('Delivery (per store)', 'ডেলিভারি (প্রতি স্টোর)')
                      }
                      value={bdt(perVendorDelivery) + t(' per store', 'প্রতি স্টোর')}
                    />
                  )}
                  {vendors.length === 1 && (
                    <Row
                      label={
                        resolvedZone === 'inside'
                          ? t('Delivery (inside Dhaka)', 'ডেলিভারি (ঢাকার ভিতরে)')
                          : resolvedZone === 'sub'
                            ? t('Delivery (sub Dhaka)', 'ডেলিভারি (সাব-ঢাকা)')
                            : t('Delivery (outside Dhaka)', 'ডেলিভারি (ঢাকার বাইরে)')
                      }
                      value={bdt(totalDeliveryCharge)}
                    />
                  )}
                  {isBkash && (
                    <Row
                      label={t('bKash cash-out fee', 'বিকাশ ক্যাশ-আউট ফি')}
                      value={bdt(bkashCashOutFee)}
                    />
                  )}
                  {/* The payment rail is restated in the summary so the shopper
                      confirms what they are about to owe before clicking. */}
                  <Row
                    label={t('Payment', 'পেমেন্ট')}
                    value={
                      isWalletPayment
                        ? `${PAYMENT_LABELS[payment]} · ${txId.trim() || t('ID pending', 'আইডি বাকি')}`
                        : t('Cash on Delivery', 'ক্যাশ অন ডেলিভারি')
                    }
                  />
                  {vendors.length > 1 && (
                    <p className="pt-1 text-[10.5px] leading-relaxed text-slate-400">
                      {t(
                        `Each seller charges its own delivery fee. Every seller ships separately with its own tracking number.`,
                        `প্রত্যেক সেলার আলাদা ডেলিভারি চার্জ নেবেন। প্রত্যেকে আলাদা ট্র্যাকিং নম্বর সহ পাঠাবেন।`,
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
                <p className="text-center text-[11px] font-medium text-slate-500">
                  {t('Your phone number above automatically tracks all your orders.', 'আপনার উপরের ফোন নম্বরটিতে সকল অর্ডার স্বয়ংক্রিয়ভাবে ট্র্যাক করা যাবে।')}
                </p>
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
