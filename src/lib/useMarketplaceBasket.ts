/**
 * Marketplace basket — the shopper's cross-vendor cart (React hook).
 *
 * The persisted store, the read/write helpers and the type live in
 * marketplaceBasket.ts, which imports NO React on purpose: the checkout page
 * and the order builders import 
eadPersistedBasket from a non-component
 * module, and pulling 
eact in there is what crashed the dashboard with
 * Cannot read properties of null (reading 'useState') — React 19's hooks read
 * a dispatcher that only exists while ReactDOM is rendering.
 *
 * This file only adds the live React state on top of that store: a badge, a
 * drawer and every product card read the SAME cart, and it must survive
 * navigation between the marketplace and a vendor's storefront.
 *
 * Each line keeps its SELLING VENDOR. That is what lets checkout group the
 * basket into one child order (and one courier slip) per merchant — see
 * persistVendorChildren in lib/serverApp.ts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MarketplaceProduct } from '../types';
import { resolveProductImage } from '../utils/imageFallback';
import {
  MARKETPLACE_BASKET_KEY,
  addMarketplaceBasketLine,
  basketSignature,
  readPersistedBasket,
  removeMarketplaceBasketLine,
  subscribeToMarketplaceBasket,
  persistMarketplaceBasket,
  type BasketLine,
} from './marketplaceBasket';

export {
  MARKETPLACE_BASKET_KEY,
  persistMarketplaceBasket,
  readPersistedBasket,
  saveMarketplaceBasket,
  subscribeToMarketplaceBasket,
  basketSignature,
  addMarketplaceBasketLine,
  removeMarketplaceBasketLine,
} from './marketplaceBasket';
export type { BasketLine } from './marketplaceBasket';

/**
 * Live view of the persisted marketplace basket.
 *
 * All bookkeeping (add / merge / quantity / remove / persist) happens in
 * `marketplaceBasket.ts`; this hook keeps a React copy that is:
 *   • seeded synchronously from storage on first render,
 *   • re-synced on our own custom event AND on another tab's `storage` event,
 *   • polled briefly while empty, because a write that bypasses the convention
 *     (a restored session, a prefilled link, an older bundle) is otherwise
 *     indistinguishable from a genuinely empty basket — the recurring
 *     "checkout says my basket is empty" report.
 */
export function useMarketplaceBasket() {
  const [lines, setLines] = useState<BasketLine[]>(() => readPersistedBasket());

  /**
   * Mirrors `lines` for event handlers.
   *
   * The listeners below are registered once (empty dependency list), so they
   * would otherwise close over the FIRST render's `lines` forever and could
   * only ever re-read storage — comparing against a stale array is what made
   * a re-read overwrite the good state held in this tab.
   */
  const linesRef = useRef<BasketLine[]>(lines);

  const commit = useCallback((next: BasketLine[]) => {
    linesRef.current = next;
    setLines(next);
  }, []);

  /**
   * ADOPT A BASKET THAT LANDS AFTER THIS HOOK MOUNTED.
   *
   * A later event is adopted whenever it carries lines, and an empty copy is
   * never allowed to replace a non-empty one from storage — losing a shopper's
   * basket to a race is exactly what this guards against.
   */
  const syncFromStorage = useCallback(() => {
    const stored = readPersistedBasket();
    const current = linesRef.current;
    if (stored.length === 0 && current.length > 0) return;
    if (basketSignature(stored) === basketSignature(current)) return;
    commit(stored);
  }, [commit]);

  useEffect(() => subscribeToMarketplaceBasket(syncFromStorage), [syncFromStorage]);

  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    syncFromStorage();
  }, [syncFromStorage]);

  // Poll only while the basket is empty; stop as soon as a line appears.
  useEffect(() => {
    if (lines.length > 0) return;
    const id = window.setInterval(syncFromStorage, 400);
    return () => window.clearInterval(id);
  }, [lines.length, syncFromStorage]);

  const fetchedMissingIdsRef = useRef<Set<string>>(new Set());

  // Fetch fresh product data when a stored line has no usable image.
  useEffect(() => {
    if (typeof window === 'undefined' || lines.length === 0) return;
    const missing = lines.filter((l) => {
      const p = l?.product as any;
      const img = resolveProductImage(p) || resolveProductImage(l);
      return !img;
    });

    if (missing.length === 0) return;

    const ids = Array.from(
      new Set(
        missing
          .map((l) => String(l.product?.id || (l as any)?.productId || ''))
          .filter(Boolean)
      )
    ).filter((id) => !fetchedMissingIdsRef.current.has(id));

    if (ids.length === 0) return;
    ids.forEach((id) => fetchedMissingIdsRef.current.add(id));

    fetch(`/api/products?ids=${encodeURIComponent(ids.join(','))}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((dbProducts: any[]) => {
        if (!Array.isArray(dbProducts) || dbProducts.length === 0) return;
        const map = new Map<string, any>();
        for (const p of dbProducts) {
          const key = String(p?.id ?? p?._id ?? p?.productId ?? '');
          if (key) map.set(key, p);
        }

        let changed = false;
        const currentLines = linesRef.current;
        const updated = currentLines.map((l) => {
          const id = String(l.product?.id || (l as any)?.productId || '');
          const fresh = map.get(id);
          if (!fresh) return l;
          const freshImg = resolveProductImage(fresh);
          if (!freshImg) return l;
          changed = true;
          return {
            ...l,
            product: {
              ...l.product,
              image: freshImg,
              imageUrl: freshImg,
              image_url: freshImg,
              thumbnail: freshImg,
              images: [
                freshImg,
                ...(Array.isArray(fresh.images)
                  ? fresh.images.filter((x: any) => x !== freshImg)
                  : []),
              ],
            },
          };
        });

        if (changed) {
          persistMarketplaceBasket(updated);
          commit(updated);
        }
      })
      .catch(() => {
        // Silently tolerate network hiccups
      });
  }, [lines, commit]);

  const add = useCallback((product: MarketplaceProduct, quantity = 1) => {
    // ACCUMULATE, NEVER OVERWRITE — see addMarketplaceBasketLine().
    const next = addMarketplaceBasketLine(readPersistedBasket(), {
      productId: String(product.id),
      vendorId: product.vendor_id || (product as any).vendorId || '',
      quantity,
      product,
    });
    persistMarketplaceBasket(next);
    commit(next);
  }, [commit]);

  const setQuantity = useCallback((productId: string, vendorId: string, quantity: number) => {
    // `0` removes the line — that is what the drawer's minus button means at 1.
    const wanted = Math.max(0, Math.floor(Number(quantity) || 0));
    const next = readPersistedBasket()
      .map((line) => (String(line.product.id) === String(productId) &&
        (String(line.product.vendor_id || line.product.vendor_slug || '') === String(vendorId || '') ||
         !vendorId)
        ? { ...line, quantity: wanted }
        : line))
      .filter((line) => line.quantity > 0);
    persistMarketplaceBasket(next);
    commit(next);
  }, [commit]);

  const remove = useCallback((productId: string, vendorId: string) => {
    const next = removeMarketplaceBasketLine(readPersistedBasket(), { productId, vendorId });
    persistMarketplaceBasket(next);
    commit(next);
  }, [commit]);

  const clear = useCallback(() => {
    persistMarketplaceBasket([]);
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

  const addItem = add;
  const removeItem = remove;
  const clearCart = clear;


  return { lines, add, addItem, setQuantity, remove, removeItem, clear, clearCart, itemCount, subtotal, vendors };
}
