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

export const PAYMENT_STATUSES = ['Paid', 'Partially paid', 'Unpaid', 'Voided', 'Pending Verification'] as const;
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
  pendingverification: 'New',
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
  pendingverification: 'Pending Verification',
  awaitingverification: 'Pending Verification',
  /*
   * `pending` is NOT `Unpaid`.
   *
   * "Unpaid" is a COD order nobody has to approve; a bare `pending` comes from
   * a wallet order that IS waiting for the Super Admin to verify the TrxID.
   * Mapping it to Unpaid meant such a row was normalised away from the
   * verification queue at every read — it could never be approved, and the
   * admin panel insisted there was nothing to verify while the order sat in the
   * database awaiting a decision.
   */
  pending: 'Pending Verification',
  pendingpayment: 'Pending Verification',
  pendingverifications: 'Pending Verification',
  verificationpending: 'Pending Verification',
  due: 'Unpaid',
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
 *
 * `extra` may carry the same order's other identifiers (`order_number`,
 * `orderId`, `transaction_id`, …); every one of them is probed too, because a
 * caller that holds a stale/mangled string for the order still holds at least
 * one column value that matches.
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

    const cleaned = key.replace(/^#/, '').trim();
    /*
     * Every identifier the admin panel may send for the SAME order.
     *
     * The Super Admin queue renders `orderNumber` (e.g. `ZID-727907022-mystore-1`)
     * but the row's `id` is a client-generated `MP-<ts>-<rand>` string that was
     * never written to the collection — only `order_number` / `id` were. A lookup
     * that only probes the strings it was given therefore missed the row the
     * admin was looking at, and approval failed with "Order … was not found."
     *
     * Variants covered: leading `#`, the `order_number` vs `id`/`orderId`
     * columns (both are written), and a `-<slug>-<n>` / `-<slug>` suffix that a
     * vendor-split child adds. The exact key is always tried first.
     */
    const keys = new Set<string>([cleaned, key].filter(Boolean));
    const addKey = (value: any) => {
      const text = String(value ?? '').trim().replace(/^#/, '');
      if (text) keys.add(text);
    };
    // Identity columns the queue carries alongside the number.
    addKey(extra.order_number);
    addKey(extra.orderNumber);
    addKey(extra.order_id);
    addKey(extra.orderId);
    addKey(extra.id);
    addKey(extra.transaction_id);
    // A child order number is `<base>-<vendorSlug>-<n>`; the master/base is the
    // part before the first extra segment. Derived only when it still looks
    // like an order id, so a genuine `ZID-123` is untouched.
    const baseMatch = /^(.*?-[A-Za-z][A-Za-z0-9_]*)(?:-\d+)?$/.exec(cleaned);
    if (baseMatch && baseMatch[1] && baseMatch[1] !== cleaned) addKey(baseMatch[1]);
    const withoutTrailingSegment = cleaned.replace(/-\d+$/, '');
    if (withoutTrailingSegment && withoutTrailingSegment !== cleaned) addKey(withoutTrailingSegment);

    const or: Record<string, any>[] = [
      { transaction_id: key },
      { tracking_code: key },
      { trackingCode: key },
      { tracking_code: cleaned },
      { trackingCode: cleaned },
      { consignment_id: key },
      { consignmentId: key },
      { consignment_id: cleaned },
      { consignmentId: cleaned },
    ];
    // Every identifier the caller holds gets the same probes, so a row found
    // under `order_number` is also found under `id` / `orderId`.
    for (const value of keys) {
      or.push({ order_number: value }, { orderNumber: value }, { id: value });
      or.push({ order_id: value }, { orderId: value }, { invoice_id: value });
    }

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

    /*
     * A store scope is only a TIE-BREAKER, never a hard filter.
     *
     * The admin queue spans every merchant, so the caller often has no store
     * ref at all — but when it does (a stale slug on the row, a store renamed
     * since checkout) ANDing it onto an exact order-number match hid an order
     * that existed and reported "was not found". An identifier that unique
     * identifies the order therefore wins on its own; the scoped query is
     * only used when the unscoped one finds nothing.
     */
    const collection = db.collection(ORDERS_COLLECTION);
    const doc = await collection.findOne({ $or: or });
    if (doc) return { doc };

    const storeScope = String(extra.store_slug || extra.storeSlug || extra.store_id || extra.merchant_id || '').trim();
    if (storeScope) {
      const scoped = await collection.findOne({
        $and: [
          { $or: or },
          {
            $or: [
              { store_slug: storeScope }, { storeSlug: storeScope },
              { store_id: storeScope }, { store_id: extra.store_id }, { storeId: storeScope },
              { merchant_id: storeScope }, { merchantId: storeScope },
              { store_code: storeScope },
              { vendor_id: storeScope }, { vendorId: storeScope },
            ],
          },
        ],
      });
      if (scoped) return { doc: scoped };
    }

    return { doc: null };
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

    // Synchronize any legacy duplicate records with the same order_number
    const orderNum = located.doc.order_number || key.replace(/^#/, '');
    if (orderNum) {
      await db.collection(ORDERS_COLLECTION).updateMany(
        { order_number: orderNum, _id: { $ne: located.doc._id } },
        { $set: set }
      ).catch(() => null);
    }

    // Re-read so the response carries the authoritative single document.
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
 *
 * WHY SO MANY ALIASES
 * ---------------------------------------------------------------------------
 * `GET /api/admin/courier-orders` (the Admin "Courier Orders List") selects an
 * order when it carries `tracking_id`, `courier_tracking`, `trackingCode`,
 * `courier.tracking_id` or a `courier_status` in ['booked','dispatched',
 * 'picked_up','in_transit','delivered']. This function used to write ONLY
 * `tracking_code`/`trackingCode`, so a real booking was invisible to that list
 * and the tab stayed empty for every dispatched order.
 *
 * Every one of those spellings is therefore written here, together with the
 * `courier_status` / `courier_tracking_*` fields the Admin list and the
 * merchant dashboard both read, so one write satisfies every reader.
 *
 * Merchant/store identity is stamped from `extra` when the caller knows it
 * (store_slug / store_code / store name / merchant phone), which is what lets
 * the Admin list show WHICH shop an order came from without a second lookup.
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
    // Drives the Admin "Courier Orders List" filter and its status badge.
    courier_status: 'dispatched',
    courier_status_updated_at: new Date(),
    // A successful dispatch moves the order into delivery.
    status: 'In delivery',
    fulfillment_status: 'In Transit',
    fulfillmentStatus: 'In Transit',
  };

  if (tracking) {
    fields.tracking_code = tracking;
    fields.trackingCode = tracking;
    // The Admin list queries these two spellings — without them the booking
    // never appears in "Courier Orders List".
    fields.tracking_id = tracking;
    fields.courier_tracking = tracking;
    fields.consignment_id = tracking;
    fields.consignmentId = tracking;
    fields.courier_tracking_id = tracking;
    fields.courierTrackingId = tracking;
  }

  /*
   * Merchant / store identity, stamped on the order itself.
   *
   * `extra` is the storeRef the dispatcher already carries; any value the
   * caller actually has is written under both spellings so the Admin list, the
   * merchant dashboard and the CSV export all resolve the same shop.
   */
  const storeSlug = String(extra.store_slug || extra.storeSlug || '').trim().toLowerCase();
  if (storeSlug) {
    fields.store_slug = storeSlug;
    fields.storeSlug = storeSlug;
  }
  const storeCode = String(extra.store_code || extra.storeCode || '').trim();
  if (storeCode) {
    fields.store_code = storeCode;
    fields.storeCode = storeCode;
  }
  const storeName = String(extra.store_name || extra.storeName || '').trim();
  if (storeName) {
    fields.store_name = storeName;
    fields.storeName = storeName;
  }
  const storeId = String(extra.store_id || extra.storeId || '').trim();
  if (storeId) fields.store_id = storeId;
  const merchantPhone = String(extra.merchant_phone || extra.merchantPhone || '').trim();
  if (merchantPhone) {
    fields.merchant_phone = merchantPhone;
    fields.merchantPhone = merchantPhone;
  }
  const pickupAddress = String(extra.pickup_address || extra.pickupAddress || '').trim();
  if (pickupAddress) fields.pickup_address = pickupAddress;

  // Keep the raw provider payload so a support agent can see what was sent.
  if (raw && Object.keys(raw).length > 0) fields.courier_response = raw;

  return updateOrderFields(id, fields, extra);
}

/* ────────────────────── admin “Courier Orders List” ledger ────────────────── */

/**
 * Collection behind the Super Admin's “Courier Orders List”.
 *
 * WHY A SEPARATE COLLECTION
 * ---------------------------------------------------------------------------
 * That tab used to be a QUERY over the `orders` collection: it only found an
 * order that happened to carry a tracking column (or a `courier_status` in a
 * whitelist). Everything else — a Steadfast 401, a store with no API keys, a
 * booking the merchant has to enter in the courier portal by hand — left the
 * order untouched, so the tab kept saying “No courier orders yet” even though
 * the merchant had just clicked “Send to Courier”.
 *
 * Every click now writes ONE row here, whatever the outcome. The row is the
 * admin's work list: which store, which merchant phone, which pickup address,
 * the customer and amount, the tracking id, the courier status, and the labels
 * (stored as base64 under `courier_labels`, exactly like before).
 */
export const COURIER_ORDERS_COLLECTION = 'courier_orders';

/** Statuses the ledger row can carry (mirrors the Admin dropdown). */
export type CourierOrderStatus =
  | 'booked'
  | 'dispatched'
  | 'sent_to_courier'
  | 'pending'
  | 'failed'
  | 'pickup_confirmed'
  | 'in_transit'
  | 'delivered'
  | 'cancelled';

/** Stable, idempotent key for one order's ledger row. */
export function courierOrderKey(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    const text = String(candidate ?? '').replace(/^#/, '').trim();
    if (text) return text.toLowerCase();
  }
  return '';
}

/**
 * Remember ONE “Send to Courier” event for the Admin Courier Orders List.
 *
 * Called for EVERY click — booked, rejected (401/403/422), or not configured at
 * all — so the admin always gets a row with the store identity, the customer
 * info, the amount, the payment method, the tracking id (when the courier gave
 * one) and the outcome. The row is UPSERTED on the order identifier, so a
 * retry updates the same row instead of creating a duplicate, and a row that a
 * merchant/driver later moves to `delivered` is never reset backwards by a
 * re-dispatch.
 *
 * Never throws: the caller is a booking route, and a ledger write must not be
 * able to fail a dispatch.
 */
export async function recordCourierDispatchAttempt(input: {
  /** Any identifier the caller holds: order_number, invoice id, `_id`, … */
  orderId?: string;
  status: CourierOrderStatus;
  courierName?: string;
  courierKey?: string;
  trackingCode?: string;
  /** Failure reason (the provider's own wording) for the admin column. */
  error?: string;
  /** False means the parcel has to be entered in the courier portal by hand. */
  booked?: boolean;
  /** The posted/stored order document. */
  order?: Record<string, any> | null;
  /** Store identity + contact details (`store_slug`, `merchant_phone`, …). */
  storeRef?: Record<string, any> | null;
  /** Raw provider response, so support can see exactly what was sent back. */
  raw?: Record<string, any> | null;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    if (!getMongoUri()) return { ok: false, error: 'MONGODB_URI is not set.' };
    const db = await getMongoDb(ORDERS_DB_NAME);
    if (!db) return { ok: false, error: 'MongoDB is unavailable.' };

    const order = (input.order && typeof input.order === 'object' ? input.order : {}) as Record<string, any>;
    const store = (input.storeRef && typeof input.storeRef === 'object' ? input.storeRef : {}) as Record<string, any>;

    const id = courierOrderKey(
      input.orderId,
      order.order_number,
      order.orderNumber,
      order.invoice_id,
      order.invoiceId,
      order.id,
    );
    if (!id) return { ok: false, error: 'No order identifier was supplied.' };

    const pick = (...values: unknown[]): string => {
      for (const value of values) {
        if (value === undefined || value === null) continue;
        const text = String(value).trim();
        if (text) return text;
      }
      return '';
    };

    /*
     * STORE IDENTITY — the ORDER's own slug always wins.
     *
     * A store that has been renamed (or a request whose `storeSlug` is a
     * stale/old alias) must not relabel the row as a different shop: the order
     * that was just dispatched is stamped with the store it belongs to, and
     * the resolved store record is only the fallback. Without this ordering a
     * row could be filed under a slug no admin filter or dashboard query
     * knows about — a visible write that still reads as “missing”.
     */
    const orderSlug = pick(order.store_slug, order.storeSlug, order.merchant_store_slug, order.merchant_storeSlug).toLowerCase();
    const storeSlug = (orderSlug || pick(store.store_slug, store.storeSlug)).toLowerCase();
    const storeCode = pick(order.store_code, order.storeCode, store.store_code, store.storeCode);
    const storeId = pick(order.store_id, order.storeId, store.store_id, store.storeId, store.id);
    const storeName = pick(
      order.store_name, order.storeName, order.vendor_name, order.vendorName,
      store.store_name, store.storeName, store.name, storeSlug,
    );
    const merchantPhone = pick(
      order.merchant_phone, order.merchantPhone,
      store.merchant_phone, store.merchantPhone, store.phone, store.store_phone, store.storePhone,
      store.support_phone, store.supportPhone, store.contactPhone, store.contact_phone,
      store.whatsappNumber, store.whatsapp_number,
    );
    const pickupAddress = pick(
      order.pickup_address, order.pickupAddress,
      store.pickup_address, store.pickupAddress, store.pickup_point, store.store_address,
      store.storeAddress, store.address,
    );

    const customerName = pick(order.customer_name, order.customerName, order.name);
    const customerPhone = pick(order.customer_phone, order.customerPhone, order.phone);
    const customerAddress = pick(order.shipping_address, order.address, order.delivery_address);
    const customerCity = pick(order.customer_city, order.customerCity);
    const amount = Number(
      order.total_price ?? order.totalBDT ?? order.total ?? order.cod_amount ?? order.codAmount ?? 0,
    ) || 0;
    const paymentMethod = pick(order.payment_method, order.paymentMethod, order.payment?.method) || 'COD';
    const paymentStatus = pick(order.payment_status, order.paymentStatus);
    const orderNumber = pick(order.order_number, order.orderNumber, order.invoice_id, order.invoiceId, order.id, id);
    const items = order.items ?? order.order_items ?? [];

    const tracking = String(input.trackingCode || '').replace(/^#/, '').trim();
    const now = new Date();

    const set: Record<string, any> = {
      /* Identity of the row itself (both spellings the admin UI reads). */
      id,
      order_id: id,
      order_number: orderNumber,
      orderNumber,
      store_slug: storeSlug,
      storeSlug,
      store_code: storeCode,
      storeCode,
      store_id: storeId,
      store_name: storeName,
      storeName,
      merchant_phone: merchantPhone,
      merchantPhone,
      pickup_address: pickupAddress,
      pickupAddress,
      customer_name: customerName,
      customerName,
      customer_phone: customerPhone,
      customerPhone,
      customer_address: customerAddress,
      shipping_address: customerAddress,
      customer_city: customerCity,
      amount,
      total_price: amount,
      totalBDT: amount,
      payment_method: paymentMethod,
      paymentMethod,
      paymentStatus,
      items,
      courier_name: input.courierName || '',
      courierName: input.courierName || '',
      shipping_courier: input.courierName || '',
      courier_key: input.courierKey || '',
      courier_status: input.status,
      courier_status_updated_at: now,
      courier_booked: input.booked === true,
      needs_manual_entry: input.booked !== true,
      courier_last_error: input.error || '',
      updated_at: now,
      admin_visible: true,
    };
    if (tracking) {
      set.tracking_id = tracking;
      set.courier_tracking = tracking;
      set.tracking_code = tracking;
      set.trackingCode = tracking;
      set.consignment_id = tracking;
      set.courier_tracking_id = tracking;
      set.courier_booked_at = now;
    }
    if (input.raw && Object.keys(input.raw).length > 0) {
      set.courier_response = input.raw;
    }

    /*
     * A retry must not undo real progress: if the admin already moved this row
     * to in_transit/delivered/cancelled, a later dispatch attempt keeps that
     * status (it still refreshes the identity columns and the tracking id).
     */
    const existing = await db
      .collection(COURIER_ORDERS_COLLECTION)
      .findOne({ _id: id as any })
      .catch(() => null);
    if (existing) {
      const advanced = ['pickup_confirmed', 'in_transit', 'delivered', 'cancelled'];
      if (advanced.includes(String(existing.courier_status || '')) && !advanced.includes(input.status)) {
        delete set.courier_status;
        delete set.courier_status_updated_at;
      }
      /*
       * Never overwrite a known value with a blank one. A partial retry (the
       * booking route only re-posts what the modal knows) must not wipe the
       * customer, amount, store phone or labels an earlier, fuller write made.
       */
      const AMOUNT_FIELDS = ['amount', 'total_price', 'totalBDT'];
      for (const [field, value] of Object.entries(set)) {
        const previous = (existing as Record<string, any>)[field];
        const previousKnown = previous !== undefined && previous !== null && previous !== '';
        // A blank value never overwrites a known one…
        if (value === '' || value === null || value === undefined) {
          if (previousKnown) delete set[field];
          continue;
        }
        // …and neither does `0`, which is what a partial body produces for an
        // amount it did not send (a real ৳0 total is indistinguishable, and the
        // later full write restores it either way).
        if (AMOUNT_FIELDS.includes(field) && Number(value) === 0 && Number(previous) > 0) {
          delete set[field];
        }
      }
      if (Array.isArray(existing.courier_labels) && existing.courier_labels.length > 0) {
        // Labels belong to the row, not to the attempt.
        set.courier_labels = existing.courier_labels;
      }
    }

    await db.collection(COURIER_ORDERS_COLLECTION).updateOne(
      { _id: id as any },
      {
        $set: { ...set, _id: id as any },
        $setOnInsert: { created_at: now, courier_labels: [] },
      },
      { upsert: true },
    );

    console.log('[Courier][ledger] row saved', { id, status: set.courier_status || input.status, store: storeSlug });
    return { ok: true, id };
  } catch (err: any) {
    // `_id` is a String on this collection, so another shape can only fail the
    // duplicate check — never let it break the dispatch response.
    return { ok: false, error: err?.message || 'Could not record the courier dispatch.' };
  }
}

/**
 * Map Pathao shipment statuses to store order statuses.
 *
 * Pathao shipment statuses:
 *   - "Pickup Requested", "Order Created", "Pending" -> "Processing" ("Preparing")
 *   - "Picked Up", "In Transit", "Out for Delivery" -> "In delivery"
 *   - "Delivered", "Delivery Completed" -> "Completed"
 *   - "Cancelled", "Returned", "Failed Delivery" -> "Cancelled"
 */
export function mapPathaoStatusToOrderStatus(rawStatus: unknown): {
  orderStatus: OrderStatus;
  displayStatus: 'Processing' | 'In delivery' | 'Completed' | 'Cancelled';
  fulfillmentStatus: string;
} | null {
  const text = String(rawStatus ?? '').trim();
  if (!text) return null;
  const clean = normalizeKey(text);

  // 1. Pickup Requested -> Processing ("Preparing" in dashboard)
  if (
    clean.includes('pickuprequested') ||
    clean.includes('pickuprequest') ||
    clean.includes('pickupassigned') ||
    clean.includes('ordercreated') ||
    clean.includes('orderplaced') ||
    clean.includes('pendingpickup') ||
    clean.includes('assignedforpickup') ||
    clean.includes('processing') ||
    clean.includes('readytopick')
  ) {
    return {
      orderStatus: 'Preparing',
      displayStatus: 'Processing',
      fulfillmentStatus: 'Unfulfilled',
    };
  }

  // 2. Picked Up / In Transit -> In delivery
  if (
    clean.includes('pickedup') ||
    clean.includes('pickupcompleted') ||
    clean.includes('intransit') ||
    clean.includes('transit') ||
    clean.includes('outfordelivery') ||
    clean.includes('ondelivery') ||
    clean.includes('indelivery') ||
    clean.includes('dispatched') ||
    clean.includes('sorting') ||
    clean.includes('hub') ||
    clean.includes('receivedathub') ||
    clean.includes('assignedfordelivery')
  ) {
    return {
      orderStatus: 'In delivery',
      displayStatus: 'In delivery',
      fulfillmentStatus: 'In Transit',
    };
  }

  // 3. Delivered -> Completed
  if (
    clean.includes('delivered') ||
    clean.includes('deliverycompleted') ||
    clean.includes('completed') ||
    clean.includes('complete') ||
    clean.includes('partialdelivery') ||
    clean.includes('partialdelivered')
  ) {
    return {
      orderStatus: 'Completed',
      displayStatus: 'Completed',
      fulfillmentStatus: 'Delivered',
    };
  }

  // 4. Cancelled / Returned -> Cancelled
  if (
    clean.includes('cancelled') ||
    clean.includes('canceled') ||
    clean.includes('returned') ||
    clean.includes('return') ||
    clean.includes('failed') ||
    clean.includes('deliveryfailed') ||
    clean.includes('rejected') ||
    clean.includes('void') ||
    clean.includes('damaged') ||
    clean.includes('lost')
  ) {
    return {
      orderStatus: 'Cancelled',
      displayStatus: 'Cancelled',
      fulfillmentStatus: 'Cancelled',
    };
  }

  // Fallback checking canonicalOrderStatus
  const canonical = canonicalOrderStatus(text);
  if (canonical === 'Preparing') return { orderStatus: 'Preparing', displayStatus: 'Processing', fulfillmentStatus: 'Unfulfilled' };
  if (canonical === 'In delivery') return { orderStatus: 'In delivery', displayStatus: 'In delivery', fulfillmentStatus: 'In Transit' };
  if (canonical === 'Completed') return { orderStatus: 'Completed', displayStatus: 'Completed', fulfillmentStatus: 'Delivered' };
  if (canonical === 'Cancelled') return { orderStatus: 'Cancelled', displayStatus: 'Cancelled', fulfillmentStatus: 'Cancelled' };

  return null;
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
  recordCourierDispatchAttempt,
  courierOrderKey,
  mapPathaoStatusToOrderStatus,
  ORDERS_DB_NAME,
  ORDERS_COLLECTION,
  COURIER_ORDERS_COLLECTION,
};
