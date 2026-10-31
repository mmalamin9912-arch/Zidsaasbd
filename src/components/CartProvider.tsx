/**
 * CartProvider — React Context wrapper around the marketplace basket.
 *
 * WHY THIS EXISTS
 * ---------------
 * The multi-vendor marketplace cart lives in `useMarketplaceBasket` (React
 * state + localStorage persistence, cross-tab sync, legacy-format normalisation).
 * Several surfaces need to read and mutate it:
 *
 *   • MegaMarketplaceView — basket badge, drawer, per-vendor grouping
 *   • MarketplaceView     — "Add to cart" on product cards
 *   • MarketplaceCheckoutView — unified checkout at /marketplace/checkout
 *
 * Without a Context provider, each surface imports the hook independently.
 * That works, but a Context provider makes the cart a single source of truth
 * that is trivially accessible from any component, and it guarantees the
 * provider is mounted once at the top of the tree so localStorage reads/writes
 * are never duplicated across disconnected hook instances.
 *
 * USAGE
 * -----
 *   const { lines, add, setQuantity, remove, clear, itemCount, subtotal, vendors } =
 *     useCart();
 *
 * The provider is mounted in main.tsx, wrapping the whole app.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  useMarketplaceBasket,
  type BasketLine,
  MARKETPLACE_BASKET_KEY,
} from '../lib/useMarketplaceBasket';

export interface CartContextValue {
  lines: BasketLine[];
  itemCount: number;
  subtotal: number;
  vendors: ReturnType<ReturnType<typeof useMarketplaceBasket>['vendors']>;
  add: (product: Parameters<ReturnType<typeof useMarketplaceBasket>['add']>[0], quantity?: number) => void;
  setQuantity: (productId: string, vendorId: string, quantity: number) => void;
  remove: (productId: string, vendorId: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

/**
 * CartProvider — mounts once at the top of the app and exposes the shared
 * marketplace basket via Context. Persists to localStorage so the cart
 * survives page navigation and reloads.
 */
export const CartProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const basket = useMarketplaceBasket();

  const value = useMemo(
    () => ({
      lines: basket.lines,
      itemCount: basket.itemCount,
      subtotal: basket.subtotal,
      vendors: basket.vendors,
      add: basket.add,
      setQuantity: basket.setQuantity,
      remove: basket.remove,
      clear: basket.clear,
    }),
    [basket.lines, basket.itemCount, basket.subtotal, basket.vendors, basket.add, basket.setQuantity, basket.remove, basket.clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

/**
 * useCart — access the shared marketplace basket from any component.
 *
 * Falls back to calling `useMarketplaceBasket` directly when no provider is
 * mounted (e.g. a component rendered in isolation), so it never throws.
 */
export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (ctx) return ctx;
  // Fallback: use the hook directly. This keeps the component functional even
  // outside the provider, though localStorage writes still work via the hook.
  const basket = useMarketplaceBasket();
  return {
    lines: basket.lines,
    itemCount: basket.itemCount,
    subtotal: basket.subtotal,
    vendors: basket.vendors,
    add: basket.add,
    setQuantity: basket.setQuantity,
    remove: basket.remove,
    clear: basket.clear,
  };
}

export default CartProvider;
