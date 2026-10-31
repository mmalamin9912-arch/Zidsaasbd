/**
 * ORDER SYNC — the "a new order just landed" signal.
 *
 * ── Why not just poll faster ────────────────────────────────────────────────
 * The merchant dashboard already polls `/api/orders` on an interval. Polling
 * alone has two problems a merchant notices:
 *
 *   1. LATENCY. With a 20–30s interval a new order can sit invisible for half a
 *      minute. During a flash sale that is the difference between shipping it
 *      today and shipping it tomorrow.
 *   2. WRITE-AFTER-WRITE. The checkout runs in the shopper's tab. When that tab
 *      is the merchant's own browser (testing, or an owner buying from their own
 *      store), nothing tells the dashboard tab to refetch — it waits out the
 *      interval.
 *
 * Because this app has no central SWR/React Query cache to invalidate, the
 * equivalent is an explicit invalidation broadcast:
 *
 *   - `notifyOrdersChanged()` is called by the writer (checkout success, a
 *     merchant action, an API response) and fans out to every listener;
 *   - `subscribeOrdersChanged()` is what each reader (dashboard poll, sidebar
 *     badge, customer orders) registers, and it is what turns "refetch" from a
 *     timer into an event.
 *
 * `BroadcastChannel` carries the signal across TABS (a shopper tab and a
 * merchant tab are separate JavaScript worlds — a `window` event cannot reach
 * across). The `window` event carries it within one tab, where a
 * BroadcastChannel message is not delivered back to the sender.
 *
 * ── Why not WebSockets / Mongo change streams ──────────────────────────────
 * A change stream needs a replica-set connection held open per merchant tab and
 * a server-side fan-out keyed by store id; that is a real piece of
 * infrastructure for a signal whose payload is a single word. Two signals, one
 * message each, and the existing (authoritative, store-filtered) poll does the
 * actual reading. If a server-side push is added later, it only has to call
 * `notifyOrdersChanged()` on the client — nothing here changes.
 */

/** Fired on `window` when orders change in THIS tab. */
export const ORDERS_CHANGED_EVENT = 'zid:orders-changed';

/** Cross-tab channel name. */
const CHANNEL_NAME = 'zid-orders-sync';

export interface OrdersChangedDetail {
  /** The store the change belongs to, when known (slug or id). */
  storeRef?: string;
  /** Rough reason, for logging only — never used for logic. */
  reason?: 'placed' | 'updated' | 'deleted' | 'pulled' | 'unknown';
  /** How many orders the actor believes it changed, when known. */
  count?: number;
}

let channel: BroadcastChannel | null = null;

/**
 * One channel per tab, created lazily.
 *
 * `BroadcastChannel` is absent in some embedded WebViews and in older Safari;
 * the module degrades to same-tab events only rather than throwing at import
 * time (which would take the whole dashboard down for a notification).
 */
function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null;
  if (channel) return channel;
  try {
    if (typeof BroadcastChannel === 'undefined') return null;
    channel = new BroadcastChannel(CHANNEL_NAME);
    return channel;
  } catch {
    return null;
  }
}

/** Normalise a store reference so `Dhaka-Weaves` and `dhaka-weaves` compare. */
export function normalizeStoreRef(ref?: string | null): string {
  return String(ref || '').trim().toLowerCase();
}

/**
 * Announce that the order list changed.
 *
 * Safe to call from anywhere (it no-ops outside a browser) and cheap enough to
 * call on every successful write. It never throws: a failed broadcast must not
 * turn a successful order into a failed one.
 */
export function notifyOrdersChanged(detail: OrdersChangedDetail = {}): void {
  if (typeof window === 'undefined') return;
  const payload: OrdersChangedDetail = { reason: 'unknown', ...detail };
  try {
    window.dispatchEvent(new CustomEvent<OrdersChangedDetail>(ORDERS_CHANGED_EVENT, { detail: payload }));
  } catch {
    /* no CustomEvent (very old engine) — the cross-tab channel still fires */
  }
  try {
    getChannel()?.postMessage(payload);
  } catch {
    /* channel closed or serialisation failed */
  }
}

/**
 * Listen for order changes.
 *
 * `handler` runs for changes made in THIS tab and in any OTHER tab. A listener
 * that cares about one store passes `storeRef`; an event with no store (or a
 * mismatched one) is ignored, so a change in one merchant's dashboard does not
 * make every other merchant's dashboard refetch.
 *
 * Returns the unsubscribe function.
 */
export function subscribeOrdersChanged(
  handler: (detail: OrdersChangedDetail) => void,
  storeRef?: string,
): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const wanted = normalizeStoreRef(storeRef);
  const matches = (detail: OrdersChangedDetail) => {
    if (!wanted) return true;
    const incoming = normalizeStoreRef(detail?.storeRef);
    // An event with no store is a broadcast to everyone (e.g. "someone
    // reconnected"); a scoped event must name this store.
    return !incoming || incoming === wanted;
  };

  const onLocal = (event: Event) => {
    const detail = (event as CustomEvent<OrdersChangedDetail>).detail || {};
    if (matches(detail)) handler(detail);
  };

  const ch = getChannel();
  const onMessage = (event: MessageEvent<OrdersChangedDetail>) => {
    const detail = event.data || {};
    // A BroadcastChannel message is NOT delivered to the tab that posted it, so
    // there is no risk of double-firing with `onLocal`.
    if (matches(detail)) handler(detail);
  };

  window.addEventListener(ORDERS_CHANGED_EVENT, onLocal);
  ch?.addEventListener('message', onMessage as EventListener);

  return () => {
    window.removeEventListener(ORDERS_CHANGED_EVENT, onLocal);
    ch?.removeEventListener('message', onMessage as EventListener);
  };
}
