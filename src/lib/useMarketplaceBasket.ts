/**
 * Marketplace basket — the shopper's cross-vendor cart.
 *
 * WHY A SEPARATE HOOK
 * ---------------------------------------------------------------------------
 * The mega-marketplace header needs a live basket badge and drawer, and every
 * product card needs "add to basket". Both read the SAME cart, and it must
 * survive navigation between the marketplace and a vendor's own storefront —
 * so it is persisted and synchronised through a custom event.
 *
 * Each line keeps its SELLING VENDOR. That is what lets checkout group the
 * basket into one child order (and one courier slip) per merchant — see
 * `persistVendorChildren` in lib/serverApp.ts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MarketplaceProduct } from '../types';

/** localStorage key. Never shared with a merchant's own single-store cart. */
export const MARKETPLACE_BASKET_KEY = 'zid_marketplace_cart';

/** Fired when the basket changes, so every mounted consumer re-reads it. */
const BASKET_EVENT = 'zid:marketplace-basket';

export interface BasketLine {
  product: MarketplaceProduct;
  quantity: number;
}

/**
 * Read the persisted basket straight from localStorage.
 *
 * Exported so a page that must be right on its FIRST render (`/marketplace/
 * checkout`, a freshly opened checkout tab) can seed itself from storage
 * itself, without waiting for a Context update or a sibling hook's effect.
 * Returns `[]` — never throws — when storage is unavailable or corrupt.
 */
export function readPersistedBasket(): BasketLine[] {
  return readBasket();
}

/**
 * Normalise ONE stored line into the current shape.
 *
 * WHY THIS EXISTS — the "Your basket is empty" report.
 *
 * The reader used to require `line.product.id` and silently DROPPED anything
 * else. Any basket written by an earlier build (product fields at the top level,
 * `productId` instead of `product.id`, `qty` instead of `quantity`) therefore
 * read back as an EMPTY array, and the shopper landed on a checkout page saying
 * their basket was empty while the drawer had just shown them its contents.
 *
 * A stored basket is a persistence boundary: the writer is an older version we
 * no longer control. Coercing known legacy shapes is the correct fix — losing a
 * shopper's basket to a field rename is not.
 */
function normalizeLine(raw: any): BasketLine | null {
  if (!raw || typeof raw !== 'object') return null;

  // 1. Product may be nested (`product`) or spread across the line itself.
  const source = raw.product && typeof raw.product === 'object' ? raw.product : raw;
  const id = source?.id ?? source?.productId ?? source?.product_id ?? raw?.productId ?? raw?.product_id;
  if (id == null || String(id).trim() === '') return null;

  const quantity = Math.max(
    1,
    Math.floor(Number(raw.quantity ?? raw.qty ?? raw.count ?? 1) || 1),
  );

  // 2. Title may be `title`, `name`, or `productName` (older checkout shape).
  const title = String(
    source.title ?? source.name ?? source.productName ?? raw.title ?? raw.name ?? '',
  ).trim();

  const priceBDT = Number(
    source.priceBDT ?? source.price ?? source.unitPriceBDT ?? source.unit_price ?? raw.priceBDT ?? raw.price ?? 0,
  ) || 0;

  const vendorId = String(
    source.vendor_id ?? source.vendorId ?? source.store_id ?? source.storeId ?? raw.vendorId ?? '',
  ).trim();

  const product = {
    ...source,
    id: String(id),
    title: title || 'Item',
    priceBDT,
    image: String(source.image ?? source.image_url ?? source.imageUrl ?? source.thumbnail ?? ''),
    vendor_id: vendorId,
    vendor_name: String(source.vendor_name ?? source.vendorName ?? source.store_name ?? raw.vendorName ?? ''),
    vendor_slug: String(source.vendor_slug ?? source.vendorSlug ?? source.store_slug ?? raw.vendorSlug ?? ''),
    store_id: vendorId,
    store_slug: String(source.vendor_slug ?? source.vendorSlug ?? source.store_slug ?? raw.vendorSlug ?? ''),
    storeSlug: String(source.vendor_slug ?? source.vendorSlug ?? source.store_slug ?? raw.vendorSlug ?? ''),
  } as BasketLine['product'];

  return { product, quantity };
}

const memoryBasket = new Map<string, string>();

/** Used only when the primary key cannot be written (private mode / quota). */
const FALLBACK_KEY = 'zid_marketplace_cart_mirror';

function parseBasket(raw: string | null | undefined): BasketLine[] {
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  // `map` + `filter`, NOT `filter` on the raw shape: a line is recovered
  // whenever it carries an id in ANY known spelling.
  return parsed.map(normalizeLine).filter((line): line is BasketLine => line !== null);
}

/**
 * Read the basket, in priority order: canonical key → fallback mirror → the
 * in-memory copy. A key that exists but is CORRUPT falls through to the next
 * source instead of returning an empty basket that hides a real one.
 */
function readBasket(): BasketLine[] {
  if (typeof window === 'undefined') return parseBasket(memoryBasket.get(MARKETPLACE_BASKET_KEY));

  const sources: Array<() => string | null | undefined> = [
    () => localStorage.getItem(MARKETPLACE_BASKET_KEY),
    () => localStorage.getItem(FALLBACK_KEY),
    () => memoryBasket.get(MARKETPLACE_BASKET_KEY),
  ];

  for (const load of sources) {
    let raw: string | null | undefined;
    try {
      raw = load();
    } catch {
      continue; // localStorage unavailable — try the next source
    }
    if (!raw) continue;
    try {
      return parseBasket(raw);
    } catch {
      /* corrupt entry — fall through to the next source */
    }
  }

  return [];
}

/**
 * Persist the basket.
 *
 * The write happens SYNCHRONOUSLY (localStorage is a blocking API) so that the
 * unified checkout, which reads the same key on mount, always sees the lines
 * the shopper just added — even when navigation happens in the same tick.
 *
 * A storage failure (private mode, quota, a locked-down WebView) falls back to
 * an in-memory copy instead of silently dropping the basket, which used to
 * surface as "Your basket is empty" on the checkout page.
 */
function writeBasket(lines: BasketLine[]) {
  const serialized = JSON.stringify(lines);
  memoryBasket.set(MARKETPLACE_BASKET_KEY, serialized);
  if (typeof window === 'undefined') return;

  try {
    // Canonical key first — every reader checks it before anything else.
    localStorage.setItem(MARKETPLACE_BASKET_KEY, serialized);
    // Canonical write succeeded: a stale mirror is no longer needed.
    try {
      localStorage.removeItem(FALLBACK_KEY);
    } catch {
      /* ignore */
    }
  } catch (e) {
    // Quota exceeded / private mode / locked WebView: keep a mirror copy so
    // `readBasket` (canonical → fallback → memory) can still recover the
    // lines instead of presenting the shopper with an empty basket on the
    // checkout page.
    try {
      localStorage.setItem(FALLBACK_KEY, serialized);
    } catch (mirrorErr) {
      console.warn('[Marketplace] basket mirror persist warning:', mirrorErr);
    }
    console.warn('[Marketplace] basket persist warning:', e);
  }

  window.dispatchEvent(new Event(BASKET_EVENT));
}

/**
 * The identity of one basket line.
 *
 * Both halves must agree for two lines to be the same item. The VENDOR half is
 * resolved through every spelling the surfaces use — the product card stamps
 * `vendor_id`, the storefront's quick-view may only have `vendor_slug`/`store_id`
 * — because keying on `vendor_id` alone meant the SAME product arriving by a
 * different spelling produced a SECOND line instead of incrementing the first:
 * the visible "my cart shows one product twice" report.
 */
const vendorKeyOf = (p: any): string =>
  String(
    p?.vendor_id ?? p?.vendorId ?? p?.store_id ?? p?.storeId ??
    p?.vendor_slug ?? p?.vendorSlug ?? p?.store_slug ?? p?.storeSlug ?? '',
  ).trim().toLowerCase();

const sameLine = (a: BasketLine, b: { productId: string; vendorId?: string }) =>
  String(a.product.id) === String(b.productId) &&
  vendorKeyOf(a.product) === String(b.vendorId || '').trim().toLowerCase();

const basketSignature = (items: BasketLine[]): string =>
  items
    .map((line) => `${line.product?.id}:${line.quantity}`)
    .sort()
    .join('|');

export function useMarketplaceBasket() {
  const [lines, setLines] = useState<BasketLine[]>(() => readBasket());

  /**
   * Mirrors `lines` for event handlers.
   *
   * The listeners below are registered once (empty dependency list), so they
   * would otherwise close over the FIRST render's `lines` forever and could
   * only ever re-read storage — comparing against a stale array is what made
   * a re-read overwrite the good state held in this tab.
   */
  const linesRef = useRef<BasketLine[]>(lines);

  /**
   * ADOPT A BASKET THAT LANDS AFTER THIS HOOK MOUNTED.
   *
   * This is the `/marketplace/checkout` "Your basket is empty" bug. The
   * checkout mounts in the same click that navigates away from the drawer, and
   * the basket it needs is often written by code that runs after that render
   * (another consumer's effect, a restored session, a slow hydration). The
   * hook seeded from storage and then sat still: the persisted basket arrived
   * moments later and nothing re-read it, so the checkout kept rendering the
   * empty state for a shopper whose drawer had just listed every item.
   *
   * A later event is therefore adopted whenever it carries lines, and an empty
   * copy is never allowed to replace a non-empty one from storage — losing a
   * shopper's basket to a race is exactly what this guards against.
   */
  const commit = useCallback((next: BasketLine[]) => {
    linesRef.current = next;
    setLines(next);
  }, []);

  const syncFromStorage = useCallback(() => {
    const stored = readBasket();
    const current = linesRef.current;
    if (stored.length === 0 && current.length > 0) return;
    if (basketSignature(stored) === basketSignature(current)) return;
    commit(stored);
  }, [commit]);

  // Re-read on our own event and on another tab's write (`storage`).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      // Only our keys, so unrelated dashboard writes do not churn the basket.
      if (e.key && e.key !== MARKETPLACE_BASKET_KEY && e.key !== FALLBACK_KEY) return;
      syncFromStorage();
    };
    window.addEventListener(BASKET_EVENT, syncFromStorage);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(BASKET_EVENT, syncFromStorage);
      window.removeEventListener('storage', onStorage);
    };
  }, [syncFromStorage]);

  /**
   * Re-read on every mount, and keep a listener alive for the whole mount.
   *
   * The unified checkout and the marketplace header are sibling trees that
   * unmount/remount on navigation. `useState(() => readBasket())` seeds the
   * FIRST render from storage, which already covers this, but an explicit sync
   * afterwards also catches the `storage` event that fires when the write came
   * from a different tab *before* this consumer subscribed.
   */
  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    syncFromStorage();
  }, [syncFromStorage]);

  /**
   * POLL WHILE THE BASKET IS EMPTY.
   *
   * The event and `storage` listeners above only fire when the WRITER follows
   * the convention — a write that lands silently (a restored session, a
   * prefilled link, an older bundle, a write from the same tab) updates
   * localStorage and nothing tells this hook. On an empty basket that is
   * indistinguishable from a genuinely empty one, which is the recurring
   * "checkout says my basket is empty" report.
   *
   * So an empty consumer re-reads storage on a short interval until lines
   * appear, then stops. The cost is a few synchronous reads while the basket
   * holds nothing, and it makes the checkout correct regardless of how the
   * basket was written.
   */
  useEffect(() => {
    if (lines.length > 0) return;
    const id = window.setInterval(syncFromStorage, 400);
    return () => window.clearInterval(id);
  }, [lines.length, syncFromStorage]);

  const add = useCallback((product: MarketplaceProduct, quantity = 1) => {
    /*
     * ACCUMULATE, NEVER OVERWRITE.
     *
     * `readBasket()` — not the hook's `lines` state — is the source of truth
     * here. Two products clicked in quick succession (or the same product from
     * a card and its quick-view) each re-read the persisted basket before
     * appending, so a stale closure can never replace earlier lines with just
     * the newest one.
     *
     * There is NO upper bound on quantity: this is a general-purpose
     * marketplace, and some goods (fabric by the yard, rice by the kilo) are
     * legitimately ordered in the hundreds. The 99 cap that used to live here
     * silently discarded everything past it.
     */
    const qty = Math.max(1, Math.floor(Number(quantity) || 1));
    const current = readBasket();
    const target = {
      productId: String(product.id),
      // Resolved the same way `sameLine` resolves the stored line, so a
      // slug-only product matches its own card-added twin.
      vendorId: vendorKeyOf(product),
    };
    const existing = current.find((line) => sameLine(line, target));
    const next = existing
      ? current.map((line) => (sameLine(line, target)
        ? { ...line, quantity: Number(line.quantity || 1) + qty }
        : line))
      : [...current, { product, quantity: qty }];
    writeBasket(next);
    commit(next);
  }, [commit]);

  const setQuantity = useCallback((productId: string, vendorId: string, quantity: number) => {
    /*
     * `0` removes the line (that is what the drawer's minus button means when
     * the count is 1). Anything below 0 is clamped to 0. There is NO upper
     * cap — same reasoning as `add` above.
     */
    const wanted = Math.max(0, Math.floor(Number(quantity) || 0));
    const next = readBasket()
      .map((line) => (sameLine(line, { productId, vendorId })
        ? { ...line, quantity: wanted }
        : line))
      .filter((line) => line.quantity > 0);
    writeBasket(next);
    commit(next);
  }, [commit]);

  const remove = useCallback((productId: string, vendorId: string) => {
    const next = readBasket().filter((line) => !sameLine(line, { productId, vendorId }));
    writeBasket(next);
    commit(next);
  }, [commit]);

  const clear = useCallback(() => {
    writeBasket([]);
    commit([]);
  }, [commit]);

  const itemCount = useMemo(
    () => lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0),
    [lines],
  );

  const subtotal = useMemo(
    () => lines.reduce((sum, line) => sum + (Number(line.product?.priceBDT) || 0) * Number(line.quantity || 0), 0),
    [lines],
  );

  /** The distinct sellers in the basket — drives the per-vendor split preview. */
  const vendors = useMemo(() => {
    const map = new Map<string, { vendorId: string; vendorName: string; vendorSlug: string; quantity: number; subtotal: number }>();
    for (const line of lines) {
      const id = String(line.product.vendor_id || line.product.vendor_slug || 'unknown');
      const existing = map.get(id);
      const amount = (Number(line.product.priceBDT) || 0) * Number(line.quantity || 0);
      if (existing) {
        existing.quantity += Number(line.quantity || 0);
        existing.subtotal += amount;
      } else {
        map.set(id, {
          vendorId: id,
          vendorName: line.product.vendor_name || 'Store',
          vendorSlug: line.product.vendor_slug || '',
          quantity: Number(line.quantity || 0),
          subtotal: amount,
        });
      }
    }
    return [...map.values()];
  }, [lines]);

  return { lines, add, setQuantity, remove, clear, itemCount, subtotal, vendors };
}
