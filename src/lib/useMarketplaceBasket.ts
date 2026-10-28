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
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MarketplaceProduct } from '../types';

/** localStorage key. Never shared with a merchant's own single-store cart. */
export const MARKETPLACE_BASKET_KEY = 'zid_marketplace_cart';

/** Fired when the basket changes, so every mounted consumer re-reads it. */
const BASKET_EVENT = 'zid:marketplace-basket';

export interface BasketLine {
  product: MarketplaceProduct;
  quantity: number;
}

function readBasket(): BasketLine[] {
  try {
    const raw = localStorage.getItem(MARKETPLACE_BASKET_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((line: any) => line?.product?.id);
  } catch {
    return [];
  }
}

function writeBasket(lines: BasketLine[]) {
  try {
    localStorage.setItem(MARKETPLACE_BASKET_KEY, JSON.stringify(lines));
  } catch (e) {
    console.warn('[Marketplace] basket persist warning:', e);
  }
  window.dispatchEvent(new Event(BASKET_EVENT));
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
