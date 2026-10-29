/**
 * Marketplace WISHLIST — saved-for-later products, across vendors.
 *
 * WHY A SEPARATE STORE FROM THE BASKET
 * ---------------------------------------------------------------------------
 * A wishlist is a different intent from a cart: it survives for months, it is
 * not reserved stock, and it never takes part in checkout. Keeping it in its own
 * key means "clear basket after ordering" can never wipe a shopper's saved list.
 *
 * The record shape is deliberately the SAME `{ product, quantity }` the basket
 * uses, so a "move to basket" is a straight hand-off with no field mapping, and
 * the drawer can render both with one component.
 *
 * Persistence and cross-tab sync mirror `useMarketplaceBasket` exactly (a custom
 * event plus the `storage` event) so opening a product in one tab updates the
 * header badge in another.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MarketplaceProduct } from '../types';

export const MARKETPLACE_WISHLIST_KEY = 'zid_marketplace_wishlist';

/** Fired when the wishlist changes, so every mounted consumer re-reads it. */
const WISHLIST_EVENT = 'zid:marketplace-wishlist';

/** Hard cap. An unbounded list would grow localStorage until writes start failing. */
const MAX_WISHLIST_ITEMS = 100;

export interface WishlistItem {
  product: MarketplaceProduct;
  quantity: number;
  savedAt: string;
}

function readWishlist(): WishlistItem[] {
  try {
    const raw = localStorage.getItem(MARKETPLACE_WISHLIST_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item: any) => item?.product?.id);
  } catch {
    return [];
  }
}

function writeWishlist(items: WishlistItem[]) {
  try {
    localStorage.setItem(MARKETPLACE_WISHLIST_KEY, JSON.stringify(items));
  } catch (e) {
    console.warn('[Marketplace] wishlist persist warning:', e);
  }
  window.dispatchEvent(new Event(WISHLIST_EVENT));
}

export function useMarketplaceWishlist() {
  const [items, setItems] = useState<WishlistItem[]>(() => readWishlist());

  useEffect(() => {
    const sync = () => setItems(readWishlist());
    window.addEventListener(WISHLIST_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(WISHLIST_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  /** Stable identity for an item: product id + selling vendor. */
  const keyOf = (productId: string, vendorId?: string) =>
    `${productId}::${vendorId || ''}`;

  const has = useCallback(
    (productId: string, vendorId?: string) =>
      items.some((item) => keyOf(String(item.product.id), item.product.vendor_id) === keyOf(productId, vendorId)),
    [items],
  );

  /** Toggle: returns true when the product is now saved, false when removed. */
  const toggle = useCallback(
    (product: MarketplaceProduct, quantity = 1): boolean => {
      const key = keyOf(String(product.id), product.vendor_id);
      const current = readWishlist();
      const existing = current.find((item) => keyOf(String(item.product.id), item.product.vendor_id) === key);
      let next: WishlistItem[];
      let saved: boolean;

      if (existing) {
        next = current.filter((item) => keyOf(String(item.product.id), item.product.vendor_id) !== key);
        saved = false;
      } else {
        next = [
          { product, quantity, savedAt: new Date().toISOString() },
          ...current,
        ].slice(0, MAX_WISHLIST_ITEMS);
        saved = true;
      }

      writeWishlist(next);
      setItems(next);
      return saved;
    },
    [],
  );

  const remove = useCallback((productId: string, vendorId?: string) => {
    const key = keyOf(productId, vendorId);
    const next = readWishlist().filter(
      (item) => keyOf(String(item.product.id), item.product.vendor_id) !== key,
    );
    writeWishlist(next);
    setItems(next);
  }, []);

  const clear = useCallback(() => {
    writeWishlist([]);
    setItems([]);
  }, []);

  const count = useMemo(() => items.length, [items]);

  return { items, has, toggle, remove, clear, count };
}
