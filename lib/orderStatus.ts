/**
 * Order status + payment status persistence, and courier dispatch bookkeeping.
 *
 * THE PROBLEM
 * -----------
 * The Orders table's Status and Payment Status dropdowns called
 * `onUpdateOrders(updated)` — a React setState. The `orders` document in
 * MongoDB was never touched, so the 4-second poll in OrdersView (which treats
 * the server list as authoritative) overwrote the change and the badge snapped
 * back. Courier booking had the same gap: the tracking code was held only in
 * component state, so `shipping_courier` / `tracking_code` never reached the DB
 * and the badge vanished on reload.
 *
 * This module is the single place that:
 *   • normalises a UI status label into the value the dashboard READS BACK
 *     (the read path maps `status` → the display tab), so a write is visible,
 *   • locates one order in MongoDB without a valid ObjectId (`_id` is a real
 *     ObjectId but the dashboard keys off the app-level `order_number`/`id`),
 *   • writes the change and returns the FRESH document so the UI can render
 *     from the server response instead of guessing.
 *
 * Everything degrades to a shaped result — a route must never 5xx.
 *
 * CANONICAL VALUES
 * ----------------
 * Status (exactly what OrdersView's mapOrder/STATUS_TABS expect):
 *   New | Preparing | Ready | In delivery | Completed | Cancelled
 * Payment status:
 *   Paid | Partially paid | Unpaid | Voided
 * Either may also be a legacy value already stored on the row; a recognised
 * legacy spelling is canonicalised, anything else is persisted verbatim.
 */

import { getMongoUri, getMongoDb, DB_NAME } from './db.js';

/* ────────────────────────── collections ────────────────────────── */

export const ORDERS_DB_NAME = process.env.MONGODB_DB || 'zidbdsaas';
export const ORDERS_COLLECTION = 'orders';

/* ────────────────────────── canonical values ────────────────────────── */

export const ORDER_STATUSES = ['New', 'Preparing', 'Ready', 'In delivery', 'Completed', 'Cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ['Paid', 'Partially paid', 'Unpaid', 'Voided'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * Legacy / alternate spellings → the canonical value the UI expects.
 * Keys are compared case-insensitively with non-alphanumerics stripped, so
 * 'In Delivery', 'in_delivery', 'SHIPPED' and 'out for delivery' all land on
 * 'In delivery' rather than silently failing to match any status tab.
 */
const STATUS_ALIASES: Record<string, OrderStatus> = {
  new: 'New',
  pending: 'New',
  placed: 'New',
  preparing: 'Preparing',
  processing: 'Preparing',
  ready: 'Ready',
  packed: 'Ready',
  inddelivery: 'In delivery',
  indelivery: 'In delivery',
  delivery: 'In delivery',
  shipped: 'In delivery',
  intransit: 'In delivery',
  outfordelivery: 'In delivery',
  assignedcourier: 'In delivery',
  completed: 'Completed',
  complete: 'Completed',
  delivered: 'Completed',
  done: 'Completed',
  cancelled: 'Cancelled',
  canceled: 'Cancelled',
  void: 'Cancelled',
};

const PAYMENT_ALIASES: Record<string, PaymentStatus> = {
  paid: 'Paid',
  complete: 'Paid',
  completed: 'Paid',
  partiallypaid: 'Partially paid',
  partialpaid: 'Partially paid',
  partial: 'Partially paid',
  partially: 'Partially paid',
  unpaid: 'Unpaid',
  pending: 'Unpaid',
  due: 'Unpaid',
  pendingverification: 'Unpaid',
  voided: 'Voided',
  void: 'Voided',
  refunded: 'Voided',
  cancelled: 'Voided',
};

/** Normalise a status label for alias lookup. */
function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Every status tab OrdersView renders, in display order.
 *
 * This is deliberately a SUPERSET of `ORDER_STATUSES`: the reverse-logistics
 * tabs ('Processing reverse', 'Partially Reversed', 'Reversed') are real UI
 * filters but were never canonicalised, so filtering on them through Mongo
 * needs the tab label itself to be matchable.
 */
export const ORDER_STATUS_TABS = [
  'New',
  'Preparing',
  'Ready',
  'In delivery',
  'Completed',
  'Cancelled',
  'Processing reverse',
  'Partially Reversed',
  'Reversed',
] as const;

/**
 * Reverse-logistics tab → the canonical statuses it should match.
 *
 * A row in any of these states is a reverse in progress from the merchant's
 * point of view, so each reverse tab matches all of them rather than only its
 * exact label. Without this, 'Processing reverse' returned an empty list for
 * every real order.
 */
const REVERSE_ALIASES: Record<string, string[]> = {
  processingreverse: ['Processing reverse', 'Reversing', 'Reverse processing'],
  partiallyreversed: ['Partially Reversed', 'Partial Reversed', 'Partially reversed'],
  reversed: ['Reversed', 'Fully Reversed', 'Refund processed'],
};

/**
 * All the raw spellings a status may have been PERSISTED under, so a Mongo
 * `status: { $in: [...] }` filter finds the row regardless of which one was
 * written.
 *
 * Rows written by the storefront, by the dashboard dropdown and by the courier
 * dispatch route all use different spellings for the same state; matching only
 * the display label silently returned nothing.
 */
export function orderStatusQueryValues(raw: unknown): string[] {
  const text = String(raw ?? '').trim();
  if (!text) return [];

  const canonical = canonicalOrderStatus(text) || text;
  const values = new Set<string>([text, canonical]);

  // Every alias that resolves back to the canonical status.
  for (const [alias, target] of Object.entries(STATUS_ALIASES)) {
    if (target === canonical) {
      values.add(alias);
      // `outfordelivery` was persisted as 'Out for delivery' too.
      values.add(alias.replace(/([a-z])([0-9])/g, '$1 $2'));
    }
  }
  // snake_case / kebab-case variants of the canonical label.
  values.add(canonical.toLowerCase().replace(/[^a-z0-9]+/g, '_'));
  values.add(canonical.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  values.add(canonical.toLowerCase());

  // Reverse tabs also match the whole reverse family.
  const reverseKey = normalizeKey(canonical);
  for (const aliases of Object.values(REVERSE_ALIASES)) {
    if (aliases.some((a) => normalizeKey(a) === reverseKey)) {
      for (const a of aliases) {
        values.add(a);
        values.add(a.toLowerCase().replace(/[^a-z0-9]+/g, '_'));
      }
    }
  }

  return Array.from(values).filter(Boolean);
}

/** Convenience: the full `$in` value list for a status tab, or null for 'All'. */
export function orderStatusFilter(raw: unknown): string[] | null {
  const text = String(raw ?? '').trim();
  if (!text || text.toLowerCase() === 'all') return null;
  const values = orderStatusQueryValues(text);
  return values.length ? values : [text];
}

/**
 * Canonicalise an incoming order status.
 * Returns `null` when the value is empty, so the caller can skip the field
 * instead of writing `undefined` over the stored value.
 */
export function canonicalOrderStatus(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  const text = String(raw).trim();
  if (!text) return null;

  // Exact match on the canonical list first (case-insensitive).
  const exact = ORDER_STATUSES.find((s) => s.toLowerCase() === text.toLowerCase());
  if (exact) return exact;

  return STATUS_ALIASES[normalizeKey(text)] || text;
}

/** Canonicalise an incoming payment status. */
export function canonicalPaymentStatus(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  const text = String(raw).trim();
  if (!text) return null;

  const exact = PAYMENT_STATUSES.find((s) => s.toLowerCase() === text.toLowerCase());
  if (exact) return exact;

  return PAYMENT_ALIASES[normalizeKey(text)] || text;
}

/**
 * Fulfilment status that corresponds to an order status. The dashboard shows
 * this as a secondary badge, so it must move with the primary status rather
 * than being left stale.
 */
export function fulfillmentForStatus(status: string): string | undefined {
  switch (canonicalOrderStatus(status)) {
    case 'New': return 'Unfulfilled';
    case 'Preparing': return 'Unfulfilled';
    case 'Ready': return 'Unfulfilled';
    case 'In delivery': return 'In Transit';
    case 'Completed': return 'Delivered';
    case 'Cancelled': return 'Cancelled';
    default: return undefined;
  }
}

/* ────────────────────────── order location ────────────────────────── */

/** True for a 24-hex-char Mongo ObjectId. */
export function isObjectIdLike(value: string): boolean {
  return /^[a-f0-9]{24}$/i.test(String(value || '').trim());
}

/**
 * Find ONE order by whatever identifier the client holds.
 *
 * The dashboard's `Order.id` is the app-level identifier (`order_number`, or a
 * client-side `ord-…` string), NOT the Mongo `_id`. Looking up only by
 * `ObjectId` therefore missed almost every real order. This probes, in order:
 *   `_id` (when ObjectId-shaped), `order_number`, `id`, `invoice_id`,
 *   `transaction_id`, and finally the tracking code.
 */
export async function findOrder(
  id: string,
  extra: Record<string, any> = {}
): Promise<{ doc: Record<string, any> | null; error?: string }> {
  const key = String(id || '').trim();
  if (!key) return { doc: null, error: 'An order id is required.' };

  try {
    if (!getMongoUri()) return { doc: null, error: 'MONGODB_URI is not set.' };
    const db = await getMongoDb(ORDERS_DB_NAME);
    if (!db) return { doc: null, error: 'MongoDB is unavailable.' };

    const cleaned = key.replace(/^#/, '');
    const or: Record<string, any>[] = [
      { order_number: cleaned },
      { order_number: key },
      { id: key },
      { id: cleaned },
      { invoice_id: key },
      { invoice_id: cleaned },
      { transaction_id: key },
      { tracking_code: key },
      { trackingCode: key },
    ];
    // Only treat it as an ObjectId when it looks like one — casting an
    // arbitrary string would throw and fail the whole lookup.
    if (isObjectIdLike(key)) {
      try {
        const { ObjectId } = await import('mongodb');
        or.unshift({ _id: new ObjectId(key) });
      } catch {
        // mongodb types unavailable — the string probes still cover it.
      }
    }

    // Scope to the store when the caller supplied one, so an id collision in
    // another store cannot update the wrong order.
    const filter: Record<string, any> = { $or: or };
    const storeScope = String(extra.store_slug || extra.storeSlug || extra.store_id || extra.merchant_id || '').trim();
    if (storeScope) {
      filter.$and = [{
        $or: [
          { store_slug: storeScope }, { storeSlug: storeScope },
          { store_id: storeScope }, { merchant_id: storeScope },
          { store_code: storeScope },
        ],
      }];
    }

    const doc = await db.collection(ORDERS_COLLECTION).findOne(filter);
    return { doc: doc || null };
  } catch (err: any) {
    return { doc: null, error: err?.message || 'Order lookup failed.' };
  }
}

/* ────────────────────────── status writes ────────────────────────── */

export interface OrderUpdateResult {
  ok: boolean;
  /** The fresh document, so the caller can render from server truth. */
  order?: Record<string, any> | null;
  /** Fields actually written (post-canonicalisation). */
  updated?: string[];
  matched?: number;
  error?: string;
}

/**
 * Update one order's status and/or payment status in MongoDB.
 *
 * Both snake_case and camelCase spellings are written, because the dashboard
 * reads several shapes depending on how the order was created (checkout vs
 * dashboard sync). `updated_at` is stamped so a later reconciler can order
 * events.
 */
export async function updateOrderFields(
  id: string,
  fields: Record<string, any>,
  extra: Record<string, any> = {}
): Promise<OrderUpdateResult> {
  const key = String(id || '').trim();
  if (!key) return { ok: false, error: 'An order id is required.' };

  const set: Record<string, any> = { ...fields, updated_at: new Date() };
  // Never write `undefined` over a stored value.
  for (const k of Object.keys(set)) {
    if (set[k] === undefined) delete set[k];
  }
  if (Object.keys(set).length <= 1) {
    return { ok: false, error: 'No updatable fields were supplied.' };
  }

  try {
    if (!getMongoUri()) return { ok: false, error: 'MONGODB_URI is not set.' };
    const db = await getMongoDb(ORDERS_DB_NAME);
    if (!db) return { ok: false, error: 'MongoDB is unavailable.' };

    const located = await findOrder(key, extra);
    if (!located.doc) {
      return { ok: false, error: located.error || `Order ${key} was not found.` };
    }

    const res = await db.collection(ORDERS_COLLECTION).updateOne(
      { _id: located.doc._id },
      { $set: set }
    );

    // Re-read so the response carries the authoritative document.
    const fresh = await db.collection(ORDERS_COLLECTION).findOne({ _id: located.doc._id });
    return {
      ok: res.matchedCount > 0,
      order: fresh ? { ...fresh } : null,
      updated: Object.keys(set).filter((k) => k !== 'updated_at'),
      matched: res.matchedCount,
      error: res.matchedCount > 0 ? undefined : 'The order could not be updated.',
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Order update failed.' };
  }
}

/**
 * Persist a courier dispatch result: which courier, the tracking id, and the
 * statuses that follow from a successful booking.
 *
 * `shipping_courier` is written alongside `courier_name`/`courierName` because
 * the orders table, the CSV export and the filter dropdown each read a
 * different spelling.
 */
export async function recordCourierDispatch(
  id: string,
  courier: { name: string; key: string },
  trackingCode: string,
  raw: Record<string, any> = {},
  extra: Record<string, any> = {}
): Promise<OrderUpdateResult> {
  const tracking = String(trackingCode || '').trim();

  const fields: Record<string, any> = {
    shipping_courier: courier.name,
    courier_name: courier.name,
    courierName: courier.name,
    courier_key: courier.key,
    courierKey: courier.key,
    courier_booked: true,
    courier_booked_at: new Date(),
    // A successful dispatch moves the order into delivery.
    status: 'In delivery',
    fulfillment_status: 'In Transit',
    fulfillmentStatus: 'In Transit',
  };

  if (tracking) {
    fields.tracking_code = tracking;
    fields.trackingCode = tracking;
    fields.consignment_id = tracking;
    fields.consignmentId = tracking;
  }
  // Keep the raw provider payload so a support agent can see what was sent.
  if (raw && Object.keys(raw).length > 0) fields.courier_response = raw;

  return updateOrderFields(id, fields, extra);
}

export default {
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  ORDER_STATUS_TABS,
  canonicalOrderStatus,
  canonicalPaymentStatus,
  orderStatusQueryValues,
  orderStatusFilter,
  fulfillmentForStatus,
  findOrder,
  updateOrderFields,
  recordCourierDispatch,
  ORDERS_DB_NAME,
  ORDERS_COLLECTION,
};
