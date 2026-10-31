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
  try {
    if (typeof window !== 'undefined') {
      // Mirror first, so a read racing this write still finds the lines;
      // then the canonical key.
      localStorage.setItem(FALLBACK_KEY, serialized);
      localStorage.setItem(MARKETPLACE_BASKET_KEY, serialized);
      localStorage.removeItem(FALLBACK_KEY);
    }
  } catch (e) {
    console.warn('[Marketplace] basket persist warning:', e);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(BASKET_EVENT));
  }
}

/** Two lines are the same item only when vendor + product agree. */
const sameLine = (a: BasketLine, b: { productId: string; vendorId?: string }) =>
  String(a.product.id) === String(b.productId) &&
  String(a.product.vendor_id || '') === String(b.vendorId || '');

export function useMarketplaceBasket() {
  const [lines, setLines] = useState<BasketLine[]>(() => readBasket());

  // Re-read on our own event and on another tab's write (`storage`).
  useEffect(() => {
    const sync = () => setLines(readBasket());
    window.addEventListener(BASKET_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(BASKET_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  /**
   * Re-read on every mount.
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
    setLines(readBasket());
  }, []);

  const add = useCallback((product: MarketplaceProduct, quantity = 1) => {
    const current = readBasket();
    const target = { productId: String(product.id), vendorId: String(product.vendor_id || '') };
    const existing = current.find((line) => sameLine(line, target));
    const next = existing
      ? current.map((line) => (sameLine(line, target)
        ? { ...line, quantity: Math.min(99, Number(line.quantity || 1) + quantity) }
        : line))
      : [...current, { product, quantity }];
    writeBasket(next);
    setLines(next);
  }, []);

  const setQuantity = useCallback((productId: string, vendorId: string, quantity: number) => {
    const next = readBasket()
      .map((line) => (sameLine(line, { productId, vendorId })
        ? { ...line, quantity: Math.max(0, Math.min(99, quantity)) }
        : line))
      .filter((line) => line.quantity > 0);
    writeBasket(next);
    setLines(next);
  }, []);

  const remove = useCallback((productId: string, vendorId: string) => {
    const next = readBasket().filter((line) => !sameLine(line, { productId, vendorId }));
    writeBasket(next);
    setLines(next);
  }, []);

  const clear = useCallback(() => {
    writeBasket([]);
    setLines([]);
  }, []);

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
