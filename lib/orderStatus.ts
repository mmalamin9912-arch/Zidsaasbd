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
import { postgrestWrite } from './supabaseSchema.js';
import {
  upsertSupabaseLedger,
  listSupabaseLedger,
  findSupabaseLedgerRow,
  patchSupabaseLedgerRow,
  ledgerOrderKey,
} from './courierLedgerSupabase.js';

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

  // Also mirror status / courier tracking to Supabase orders table if configured
  let supaPatched = false;
  const supaCfg = readSupabaseEnv();
  if (supaCfg) {
    try {
      const cleanNum = key.replace(/^#/, '').trim();
      const patchRes = await postgrestWrite(
        supaCfg.supabaseUrl,
        supaCfg.supabaseKey,
        `/rest/v1/orders?order_number=eq.${encodeURIComponent(cleanNum)}`,
        {
          method: 'PATCH',
          body: toSupabaseLedgerPayload(set),
          headers: { Prefer: 'return=representation' },
        }
      );
      supaPatched = patchRes.ok;
      if (supaPatched) {
        console.log(`[Courier][updateOrderFields] Supabase orders table updated for ${cleanNum}`);
      }
    } catch (supaErr: any) {
      console.warn('[Courier][updateOrderFields] Supabase patch warning:', supaErr?.message || supaErr);
    }
  }

  try {
    if (!getMongoUri()) {
      if (supaPatched) {
        return {
          ok: true,
          updated: Object.keys(set).filter((k) => k !== 'updated_at'),
          matched: 1,
        };
      }
      return { ok: false, error: 'MONGODB_URI is not set and Supabase order was not matched.' };
    }
    const db = await getMongoDb(ORDERS_DB_NAME);
    if (!db) {
      if (supaPatched) {
        return {
          ok: true,
          updated: Object.keys(set).filter((k) => k !== 'updated_at'),
          matched: 1,
        };
      }
      return { ok: false, error: 'MongoDB is unavailable.' };
    }

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
export interface CourierDispatchAttemptInput {
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
}

/**
 * The canonical ledger row for ONE dispatch click.
 *
 * Shared by the MongoDB writer and the Supabase writer so both stores always
 * carry exactly the same columns — the Admin list must render identically
 * whichever one answered the read.
 */
export function buildCourierLedgerRow(input: CourierDispatchAttemptInput): Record<string, any> | null {
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
  if (!id) return null;

  const pick = (...values: unknown[]): string => {
    for (const value of values) {
      if (value === undefined || value === null) continue;
      const text = String(value).trim();
      if (text) return text;
    }
    return '';
  };

  /*
   * STORE IDENTITY — the ORDER's own slug always wins (see the long note in
   * recordCourierDispatchAttempt), then the store record fills in the rest.
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
    order.total_price ?? order.totalBDT ?? order.total_amount ?? order.total ?? order.cod_amount ?? order.codAmount ?? 0,
  ) || 0;
  const paymentMethod = pick(order.payment_method, order.paymentMethod, order.payment?.method) || 'COD';
  const paymentStatus = pick(order.payment_status, order.paymentStatus);
  const orderNumber = pick(order.order_number, order.orderNumber, order.invoice_id, order.invoiceId, order.id, id);
  const items = order.items ?? order.order_items ?? [];

  const tracking = String(input.trackingCode || '').replace(/^#/, '').trim();
  const now = new Date();

  const row: Record<string, any> = {
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
    created_at: now,
    admin_visible: true,
  };
  if (tracking) {
    row.tracking_id = tracking;
    row.courier_tracking = tracking;
    row.tracking_code = tracking;
    row.trackingCode = tracking;
    row.consignment_id = tracking;
    row.courier_tracking_id = tracking;
    row.courier_booked_at = now;
  }
  if (input.raw && Object.keys(input.raw).length > 0) row.courier_response = input.raw;
  return row;
}

export async function recordCourierDispatchAttempt(input: CourierDispatchAttemptInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  /*
   * THE ROW IS BUILT FIRST, THEN WRITTEN TO BOTH STORES INDEPENDENTLY.
   *
   * Production (`zid-marketplace.onrender.com`) runs on Supabase/PostgREST and
   * MongoDB may be missing or unreachable. The previous version returned early
   * with `MONGODB_URI is not set` / `MongoDB is unavailable` BEFORE anything was
   * persisted, so every "Send to Courier" click (including the 11:10 one for
   * #ZID-507745498 that did fire the Telegram alert) was silently dropped and
   * the Admin list stayed empty. Supabase is now written unconditionally; Mongo
   * is the (optional) secondary store.
   */
  const set = buildCourierLedgerRow(input);
  if (!set) return { ok: false, error: 'No order identifier was supplied.' };
  const id = String(set.id);

  let mongoOk = false;
  let mongoError = '';
  try {
    if (getMongoUri()) {
      const db = await getMongoDb(ORDERS_DB_NAME);
      if (db) {
        mongoOk = await writeLedgerToMongo(db, set, id, input);
      } else {
        mongoError = 'MongoDB is unavailable.';
      }
    } else {
      mongoError = 'MONGODB_URI is not set.';
    }
  } catch (err: any) {
    mongoError = err?.message || 'MongoDB write failed.';
  }

  /*
   * PRODUCTION STORE — always attempted, even when Mongo already succeeded, so
   * a project that reads from Supabase (the Admin portal does) always has the
   * row. Best-effort: a Supabase outage must not fail the courier send.
   */
  const needsLabels = Array.isArray(input.storeRef?.courier_labels)
    ? { courier_labels: input.storeRef!.courier_labels }
    : {};
  const supa = await mirrorCourierLedgerToSupabase({ ...set, ...needsLabels });

  console.log('[Courier][ledger] dispatch attempt recorded:', {
    orderId: id,
    status: input.status,
    courier: input.courierName,
    mongo: mongoOk ? 'saved' : mongoError || 'not-connected',
    supabase: supa.ok ? `saved (${supa.source})` : `FAILED (${supa.error || 'unknown'})`,
  });

  if (!mongoOk && !supa.ok) {
    console.error('[Courier][ledger] FAILED to persist dispatch attempt to any store:', {
      orderId: id,
      mongoError,
      supabaseError: supa.error,
    });
    return {
      ok: false,
      id,
      error: `Could not persist the dispatch. mongo: ${mongoError || 'failed'} | supabase: ${supa.error || 'failed'}`,
    };
  }
  if (!mongoOk) {
    console.warn('[Courier][ledger] stored in Supabase only:', mongoError);
  }
  return { ok: true, id };
}

/**
 * Record ONE "Send to Courier" click in EVERY store — the function every
 * dispatch route calls.
 *
 * It exists so a route cannot accidentally write to only one backend: the
 * MongoDB ledger AND the Supabase ledger (the production data plane) are both
 * attempted, the Supabase write most of all. It never throws, so a storage
 * problem can never turn into a failed courier dispatch.
 */
export async function recordCourierClickEverywhere(args: {
  status: 'booked' | 'failed' | 'disabled' | 'sandbox';
  courierName?: string;
  courierKey?: string;
  trackingCode?: string;
  errorMessage?: string;
  booked?: boolean;
  order: Record<string, any> | null;
  fallback?: Record<string, any> | null;
  storeRef?: Record<string, any> | null;
  raw?: Record<string, any> | null;
  /** A loader for the merchant/store document (phone, pickup address, name). */
  loadStore?: () => Promise<Record<string, any> | null>;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const status: CourierOrderStatus =
      args.status === 'booked'
        ? 'booked'
        : args.status === 'failed'
          ? 'failed'
          : args.status === 'sandbox'
            ? 'dispatched'
            // 'disabled' — automated booking is off, the admin must enter the
            // parcel by hand; it is still a real dispatch request.
            : 'sent_to_courier';

    const order = (args.order && typeof args.order === 'object' ? args.order : {}) as Record<string, any>;
    const posted = order.id || order.order_number || order.orderNumber || order.invoice_id || order.invoiceId ? '' : '';
    const loadedStore = args.loadStore ? await args.loadStore().catch(() => null) : null;
    const storeRef = { ...(loadedStore || {}), ...(args.storeRef || {}) };
    const fb = args.fallback || {};

    const targetOrderId = String(
      order.order_number || order.orderNumber ||
      order.invoice_id || order.invoiceId || order.id ||
      fb.orderNumber || fb.order_number || posted || storeRef.store_slug || '',
    );

    console.log('[Courier][ledger] recordCourierClickEverywhere triggered:', {
      orderId: targetOrderId,
      status,
      courier: args.courierName || args.courierKey,
      booked: args.booked,
      error: args.errorMessage,
    });

    return await recordCourierDispatchAttempt({
      orderId: targetOrderId,
      status,
      courierName: args.courierName,
      courierKey: args.courierKey,
      trackingCode: args.trackingCode,
      error: args.errorMessage,
      booked: args.booked === true,
      order,
      storeRef: {
        ...storeRef,
        store_slug: storeRef.store_slug || storeRef.storeSlug || order.store_slug || order.storeSlug || '',
        merchant_phone: storeRef.merchant_phone || storeRef.merchantPhone || storeRef.phone || '',
        pickup_address: storeRef.pickup_address || storeRef.pickupAddress || storeRef.address || '',
      },
      raw: args.raw || null,
    });
  } catch (err: any) {
    console.error('[Courier][ledger] recordCourierClickEverywhere failed (ignored):', err?.message || err);
    return { ok: false, error: err?.message || 'Could not record the courier dispatch.' };
  }
}

/**
 * Upsert one row into the MongoDB ledger, preserving progress and labels.
 * Shared by the dispatch recorder so the memory/durability rules live once.
 */
async function writeLedgerToMongo(
  db: any,
  set: Record<string, any>,
  id: string,
  input: CourierDispatchAttemptInput,
): Promise<boolean> {
  const now = new Date();
  if (input.raw && Object.keys(input.raw).length > 0) set.courier_response = input.raw;

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
      if (value === '' || value === null || value === undefined) {
        if (previousKnown) delete set[field];
        continue;
      }
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
  console.log('[Courier][ledger] mongo row saved', { id, status: set.courier_status || input.status, store: set.store_slug });
  return true;
}

/* ──────────────── Supabase (PostgREST) ledger — production store ──────────── */

/**
 * Write ONE ledger row to Supabase (the production data plane).
 *
 * Kept separate from `recordCourierDispatchAttempt` (MongoDB) and NEVER throws,
 * so the two stores can be called independently: a deployment with only Supabase
 * still records every click, and a deployment with only Mongo still does.
 */
export async function mirrorCourierLedgerToSupabase(
  row: Record<string, any> | null,
  cfg?: { supabaseUrl: string; supabaseKey: string },
): Promise<{ ok: boolean; source?: string; error?: string }> {
  if (!row) return { ok: false, error: 'No ledger row to write.' };
  try {
    const config = cfg || readSupabaseEnv();
    if (!config) {
      console.warn('[Courier][ledger] Supabase write skipped — credentials not configured.');
      return { ok: false, error: 'Supabase is not configured.' };
    }
    const result = await upsertSupabaseLedger(config, toSupabaseLedgerPayload(row));
    if (!result.ok) {
      console.error('[Courier][ledger] Supabase row save FAILED:', {
        id: row.id,
        order_number: row.order_number,
        source: result.source,
        error: result.error,
      });
      return { ok: false, source: result.source, error: result.error };
    }
    console.log('[Courier][ledger] Supabase row saved successfully:', {
      id: row.id,
      store: row.store_slug,
      source: result.source,
      dropped: result.droppedColumns?.length || 0,
    });
    return { ok: true, source: result.source };
  } catch (err: any) {
    console.error('[Courier][ledger] Supabase write threw:', err?.message || err);
    return { ok: false, error: err?.message || 'Supabase ledger write failed.' };
  }
}

/** Supabase credentials from the environment (service role wins, as on the server). */
export function readSupabaseEnv(): { supabaseUrl: string; supabaseKey: string } | null {
  const cleanEnvStr = (raw?: string): string => {
    if (!raw) return '';
    let str = String(raw).trim();
    str = str.replace(/^["'`\\]+|["'`\\]+$/g, '').trim();
    return str.replace(/^["'`\\]+|["'`\\]+$/g, '').trim();
  };
  const rawUrl =
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.DATABASE_URL || '';
  const rawKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_KEY || '';
  const url = cleanEnvStr(rawUrl).replace(/\/+$/, '');
  const key = cleanEnvStr(rawKey);
  if (!url || !key || !/^https?:\/\//i.test(url)) return null;
  return { supabaseUrl: url, supabaseKey: key };
}

/**
 * Normalise a ledger row for a Postgres/PostgREST row.
 *
 * `items` is a JSON STRING column on the deployed `orders` table, `timestamps`
 * must be ISO-8601, and `courier_response` is an object — JSON-encoded so the
 * mirror never trips a 22P02 cast error. `courier_labels` is an array and is
 * sent as JSON text for the same reason; the read path decodes it.
 */
export function toSupabaseLedgerPayload(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === undefined) continue;
    if (value instanceof Date) {
      out[key] = value.toISOString();
      continue;
    }
    if ((key === 'items' || key === 'courier_labels' || key === 'courier_response')
      && value !== null && typeof value === 'object') {
      out[key] = JSON.stringify(value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

/** Decode a JSON-string column coming back from PostgREST. */
export function parseLedgerJsonField(value: unknown, fallback: any): any {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

/**
 * Row-level Supabase helpers, re-exported for the routes.
 *
 * They live in `courierLedgerSupabase.ts` (pure PostgREST concerns); the routes
 * and the Mongo writer import them from here so `orderStatus.js` remains the one
 * module a caller needs for the courier ledger.
 */
export { patchSupabaseLedgerRow, findSupabaseLedgerRow };

/**
 * Every ledger row for the Admin list, whichever store holds it.
 *
 * Supabase first (the deployed data plane), MongoDB second, and rows are
 * unioned by order id so a project that has been migrated between the two still
 * shows one row per order.
 */
export async function loadCourierLedgerRows(limit = 500): Promise<{
  rows: Record<string, any>[];
  sources: string[];
}> {
  const byKey = new Map<string, Record<string, any>>();
  const sources: string[] = [];

  const cfg = readSupabaseEnv();
  if (cfg) {
    try {
      const supa = await listSupabaseLedger(cfg, limit);
      if (supa.rows.length > 0) sources.push(`supabase-${supa.source}`);
      for (const raw of supa.rows) {
        const row = normalizeSupabaseLedgerRow(raw, cfg);
        const key = courierOrderKey(row.id, row.order_id, row.order_number, row.orderNumber);
        if (key && !byKey.has(key)) byKey.set(key, row);
      }
    } catch (supaErr: any) {
      console.warn('[Courier][ledger] listSupabaseLedger warning:', supaErr?.message || supaErr);
    }

    // Also query Supabase orders table for any orders that have tracking/consignment/courier_status
    try {
      const filter = `or=(tracking_code.not.is.null,consignment_id.not.is.null,courier_status.not.is.null)&limit=${Math.min(Math.max(limit, 1), 2000)}`;
      const ordersRes = await fetch(`${cfg.supabaseUrl}/rest/v1/orders?${filter}`, {
        headers: { apikey: cfg.supabaseKey, Authorization: `Bearer ${cfg.supabaseKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout ? AbortSignal.timeout(8_000) : undefined,
      });
      if (ordersRes.ok) {
        const directOrders = await ordersRes.json().catch(() => []);
        if (Array.isArray(directOrders) && directOrders.length > 0) {
          sources.push('supabase-orders');
          for (const raw of directOrders) {
            const row = normalizeSupabaseLedgerRow(raw, cfg);
            const key = courierOrderKey(row.id, row.order_id, row.order_number, row.orderNumber);
            if (key) {
              const prev = byKey.get(key);
              if (!prev) {
                byKey.set(key, row);
              } else {
                // Merge order fields onto the ledger row if missing
                for (const [k, v] of Object.entries(row)) {
                  if ((prev[k] === undefined || prev[k] === null || prev[k] === '') && v !== undefined && v !== null && v !== '') {
                    prev[k] = v;
                  }
                }
              }
            }
          }
        }
      }
    } catch (ordErr: any) {
      console.warn('[Courier][ledger] Supabase orders table query warning:', ordErr?.message || ordErr);
    }
  }

  try {
    if (getMongoUri()) {
      const db = await getMongoDb(ORDERS_DB_NAME);
      if (db) {
        const mongoRows = await db.collection(COURIER_ORDERS_COLLECTION)
          .find({})
          .sort({ updated_at: -1, created_at: -1 })
          .limit(Math.min(Math.max(limit, 1), 2000))
          .toArray();
        if (mongoRows.length > 0) sources.push('mongodb');
        for (const row of mongoRows) {
          const key = courierOrderKey(row.id, row.order_id, row.order_number, row.orderNumber, row._id);
          if (key && !byKey.has(key)) byKey.set(key, { ...row });
        }
      }
    }
  } catch (err: any) {
    console.warn('[Courier][ledger] Mongo read warning:', err?.message || err);
  }

  return { rows: Array.from(byKey.values()), sources };
}

/** Map a PostgREST ledger row onto the column names the Admin UI reads. */
export function normalizeSupabaseLedgerRow(raw: Record<string, any>, cfg?: { supabaseUrl: string; supabaseKey: string }): Record<string, any> {
  const row: Record<string, any> = { ...raw };
  // The fallback store may wrap the payload.
  if (row.value && typeof row.value === 'object' && !row.order_number && !row.orderNumber) {
    Object.assign(row, row.value);
  } else if (typeof row.value === 'string') {
    const parsed = parseLedgerJsonField(row.value, null);
    if (parsed && typeof parsed === 'object') Object.assign(row, parsed);
  }
  row.items = parseLedgerJsonField(row.items, []);
  row.courier_labels = parseLedgerJsonField(row.courier_labels, []);
  row.courier_response = parseLedgerJsonField(row.courier_response, null);
  // camelCase aliases the admin table renders.
  row.customerName = row.customerName || row.customer_name || 'Customer';
  row.customerPhone = row.customerPhone || row.customer_phone || '';
  row.storeName = row.storeName || row.store_name || '';
  row.paymentMethod = row.paymentMethod || row.payment_method || 'COD';
  row.totalBDT = Number(row.totalBDT ?? row.amount ?? row.total_price ?? row.total_amount ?? 0) || 0;
  row.amount = row.totalBDT;
  row.tracking_id = row.tracking_id || row.courier_tracking || row.tracking_code || row.consignment_id || '';
  row.merchant_phone = row.merchant_phone || row.merchantPhone || '';
  row.pickup_address = row.pickup_address || row.pickupAddress || '';
  /*
   * The STORE record fills in anything the ledger row did not carry (older
   * rows, a partial request body) — the admin must see WHO the parcel belongs
   * to even for a row written before those columns existed.
   */
  if (!row.store_name && cfg && row.store_slug) {
    // Left as-is: enrichment happens in the GET route, which already caches
    // lookups per request. Nothing to do here synchronously.
  }
  return row;
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
  buildCourierLedgerRow,
  mirrorCourierLedgerToSupabase,
  loadCourierLedgerRows,
  recordCourierClickEverywhere,
  patchSupabaseLedgerRow,
  findSupabaseLedgerRow,
  ledgerOrderKey,
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
