/**
 * Marketplace basket (data layer) — the shopper's cross-vendor cart.
 *
 * WHY A SEPARATE MODULE FROM THE HOOK
 * ---------------------------------------------------------------------------
 * Cards, the header badge and the checkout page all read the SAME persisted
 * basket, and it must survive navigation between the marketplace and a vendor's
 * own storefront — so it is stored in localStorage and synchronised through a
 * custom event.
 *
 * This file is the PURE half: read / write / subscribe. It deliberately imports
 * NO React, because it is imported by non-component modules too (checkout
 * helpers, order builders). The `useMarketplaceBasket` hook lives in
 * `useMarketplaceBasket.ts`; a module that touches a React hook while the bundle
 * is still loading (before ReactDOM mounts) crashes with
 * `Cannot read properties of null (reading 'useState')` because React 19's hook
 * dispatcher is still `null`.
 *
 * Each line keeps its SELLING VENDOR. That is what lets checkout group the
 * basket into one child order (and one courier slip) per merchant — see
 * `persistVendorChildren` in lib/serverApp.ts.
 */
import type { MarketplaceProduct } from '../types';
import { resolveProductImage } from '../utils/imageFallback';

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

  /*
   * ONE image value, resolved from every spelling and NORMALISED to a loadable
   * URL. A stored line may carry `image`, `image_url`, `imageUrl`, `thumbnail`
   * or an `images[]` array, and the value may be a relative storage path —
   * rendering that as-is is what broke the checkout thumbnails.
   */
  const image = resolveProductImage(source) || resolveProductImage(raw);
  const product = {
    ...source,
    id: String(id),
    title: title || 'Item',
    priceBDT,
    image,
    image_url: image,
    imageUrl: image,
    thumbnail: image,
    images: image ? [image, ...(Array.isArray(source.images) ? source.images.filter((x: any) => x !== image) : [])] : (Array.isArray(source.images) ? source.images : []),
    vendor_id: vendorId,
    vendorId,
  } as MarketplaceProduct;

  return { product, quantity };
}

/** In-memory mirror, used only when localStorage is unavailable (SSR/private). */
const memoryBasket = new Map<string, string>();

/** Used only when the primary key cannot be written (private mode / quota). */
const FALLBACK_KEY = 'zid_marketplace_cart_mirror';

function parseBasket(raw: string | null | undefined): BasketLine[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.lines) ? parsed.lines : [];
    return list.map(normalizeLine).filter((line): line is BasketLine => line !== null);
  } catch {
    return [];
  }
}

/**
 * Read the basket from storage, falling back to the memory mirror and then to
 * the legacy mirror key a previous build wrote on quota errors.
 */
function readBasket(): BasketLine[] {
  if (typeof window === 'undefined') return parseBasket(memoryBasket.get(MARKETPLACE_BASKET_KEY));
  try {
    const primary = parseBasket(window.localStorage.getItem(MARKETPLACE_BASKET_KEY));
    if (primary.length) return primary;
    const mirror = parseBasket(window.localStorage.getItem(FALLBACK_KEY));
    if (mirror.length) return mirror;
    return primary;
  } catch {
    return parseBasket(memoryBasket.get(MARKETPLACE_BASKET_KEY));
  }
}

/**
 * Strip a line down to what has to persist.
 *
 * Deliberately small: a full product record (descriptions, variants, reviews)
 * would blow the localStorage quota for a handful of items, and checkout
 * re-resolves authoritative prices from the server anyway.
 */
function compactBasketLines(lines: BasketLine[]): any[] {
  return lines.map((line) => {
    const p: any = line.product || {};
    const image = p.image || p.image_url || p.imageUrl || p.thumbnail || '';
    const vendorId = p.vendor_id || p.vendorId || '';
    return {
      product: {
        id: String(p.id),
        title: p.title || p.name || 'Item',
        priceBDT: Number(p.priceBDT ?? p.price ?? 0) || 0,
        image,
        vendor_id: vendorId,
        vendorId,
        ...(p.slug ? { slug: p.slug } : {}),
        ...(p.store_slug ? { store_slug: p.store_slug } : {}),
      },
      quantity: Math.max(1, Math.floor(Number(line.quantity) || 1)),
    };
  });
}

function writeBasket(lines: BasketLine[]) {
  const serialized = JSON.stringify(compactBasketLines(lines));
  memoryBasket.set(MARKETPLACE_BASKET_KEY, serialized);
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MARKETPLACE_BASKET_KEY, serialized);
  } catch {
    // Quota / private mode: keep the memory mirror and try the smaller key.
    try {
      window.localStorage.setItem(FALLBACK_KEY, serialized);
    } catch {
      /* the in-memory mirror still serves this tab */
    }
  }
}

/**
 * Replace the persisted basket and tell every consumer about it.
 *
 * The same-tab `CustomEvent` matters: the `storage` event only fires in OTHER
 * tabs, so without it the badge and drawer would sit on stale data.
 */
export function persistMarketplaceBasket(lines: BasketLine[]): void {
  writeBasket(lines);
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(BASKET_EVENT, { detail: { lines } }));
  } catch {
    /* CustomEvent unavailable — storage is still written */
  }
}

/** Official setter alias, kept for callers that read better as "save". */
export const saveMarketplaceBasket = persistMarketplaceBasket;

/** Subscribe to basket changes (same tab + other tabs). Returns an unsubscribe. */
export function subscribeToMarketplaceBasket(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onBasket = () => listener();
  const onStorage = (e: StorageEvent) => {
    if (!e.key || e.key === MARKETPLACE_BASKET_KEY || e.key === FALLBACK_KEY) listener();
  };
  window.addEventListener(BASKET_EVENT, onBasket as EventListener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(BASKET_EVENT, onBasket as EventListener);
    window.removeEventListener('storage', onStorage);
  };
}

/** Add one product (merging with an identical vendor+product line). */
export function addMarketplaceBasketLine(
  lines: BasketLine[],
  line: { productId: string; vendorId?: string; quantity?: number; product?: MarketplaceProduct },
): BasketLine[] {
  const quantity = Math.max(1, Math.floor(Number(line.quantity) || 1));
  const existing = lines.find((candidate) => sameLine(candidate, line));
  if (existing) {
    return lines.map((candidate) =>
      candidate === existing ? { ...candidate, quantity: candidate.quantity + quantity } : candidate,
    );
  }
  if (!line.product) return lines;
  return [...lines, { product: line.product, quantity }];
}

/** Remove one product line. */
export function removeMarketplaceBasketLine(
  lines: BasketLine[],
  target: { productId: string; vendorId?: string },
): BasketLine[] {
  return lines.filter((line) => !sameLine(line, target));
}

const vendorKeyOf = (p: any): string =>
  String(
    p?.vendor_id ?? p?.vendorId ?? p?.store_id ?? p?.storeId ??
    p?.vendor_slug ?? p?.vendorSlug ?? p?.store_slug ?? p?.storeSlug ?? '',
  ).trim().toLowerCase();

const sameLine = (a: BasketLine, b: { productId: string; vendorId?: string }) =>
  String(a.product.id) === String(b.productId) &&
  vendorKeyOf(a.product) === String(b.vendorId || '').trim().toLowerCase();

/** Stable fingerprint of the basket contents, used to skip redundant re-reads. */
export const basketSignature = (items: BasketLine[]): string =>
  items
    .map((line) => `${line.product?.id}:${line.quantity}`)
    .sort()
    .join('|');
