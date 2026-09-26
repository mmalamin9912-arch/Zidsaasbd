/**
 * Order mapping / safe-formatting helpers.
 *
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * Two shapes of order flow through the dashboard:
 *
 *   1. UI orders      - `totalBDT` (number), `createdAt` (string),
 *                       `items: OrderItem[]` with `unitPriceBDT`.
 *   2. MongoDB orders - `total_price` (number), `created_at` (Date),
 *                       `items` (a JSON *string*).
 *
 * App.tsx previously pushed raw Mongo documents straight into `orders` state,
 * so the table rendered `undefined.toLocaleString()` and crashed the whole app
 * with a blank screen. `normalizeOrder` is the single place that bridges the
 * two shapes, and the `safe*` helpers below guarantee a renderable value even
 * when a field is missing entirely.
 * ---------------------------------------------------------------------------
 */

import type { Order, OrderItem } from '../types';

/** Coerce anything to a finite number, defaulting to 0. */
export function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Format an amount as a locale string. Always returns a string, so it can be
 * used directly in JSX without a `.toLocaleString()` on a possibly-undefined
 * value: `safeAmount(order.totalBDT)`.
 */
export function safeAmount(value: unknown, fallback = '0'): string {
  const n = toNumber(value, NaN);
  return Number.isFinite(n) ? n.toLocaleString() : fallback;
}

/**
 * Format a date-ish value as a locale string. Returns the given placeholder
 * when the value is missing or unparseable, so a missing `createdAt` renders
 * as "N/A" instead of throwing.
 */
export function safeDate(value: unknown, placeholder = 'N/A'): string {
  if (value === null || value === undefined || value === '') return placeholder;
  const date = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(date.getTime()) ? placeholder : date.toLocaleString();
}

/** Parse the `items` field, which may be an array or a JSON string. */
export function normalizeOrderItems(raw: unknown): OrderItem[] {
  let list: any[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
  }

  return list.map((item, index) => {
    const quantity = toNumber(item?.quantity, 1) || 1;
    // Accept every spelling the storefront / API / legacy data may use.
    const unitPrice = toNumber(
      item?.unitPriceBDT ??
        item?.unit_price_bdt ??
        item?.unitPrice ??
        item?.unit_price ??
        item?.priceBDT ??
        item?.price ??
        0
    );
    const name = String(
      item?.productName ?? item?.product_name ?? item?.name ?? item?.title ?? 'Item'
    );
    return {
      id: String(item?.id ?? item?.productId ?? item?.product_id ?? `item-${index}`),
      productName: name,
      variant: String(item?.variant ?? ''),
      quantity,
      unitPriceBDT: unitPrice,
      image: String(item?.image ?? item?.image_url ?? item?.imageUrl ?? ''),
    } as OrderItem;
  });
}

/**
 * Map a MongoDB order document (or an already-normalized UI order) into the
 * `Order` shape the dashboard renders. Every date/amount field is given a
 * usable default so the UI can never call a method on `undefined`.
 */
export function normalizeOrder(raw: any): Order {
  const order = raw && typeof raw === 'object' ? raw : {};

  const totalBDT = toNumber(
    order.totalBDT ?? order.total_price ?? order.totalAmount ?? order.total_amount ?? order.total ?? 0
  );

  // `created_at` is a Date from Mongo; `createdAt` is a display string from the
  // UI. Prefer whichever is present, and fall back to "now" so the column is
  // never empty.
  const createdSource = order.createdAt ?? order.created_at ?? order.date ?? order.orderDate ?? null;
  const parsedDate = createdSource
    ? createdSource instanceof Date
      ? createdSource
      : new Date(createdSource)
    : new Date();
  const safeParsedDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  const normalizedCreatedAt = safeDate(safeParsedDate, new Date().toLocaleString());

  return {
    ...order,
    id: String(order.id ?? order._id ?? `ord-${Date.now()}`),
    orderNumber: String(order.orderNumber ?? order.order_number ?? order.id ?? ''),
    customerName: String(order.customerName ?? order.customer_name ?? 'Customer'),
    customerPhone: String(order.customerPhone ?? order.customer_phone ?? ''),
    customerCity: String(order.customerCity ?? order.customer_city ?? ''),
    deliveryZone: order.deliveryZone ?? 'Inside Dhaka',
    address: String(order.address ?? order.shipping_address ?? ''),
    totalBDT,
    subtotalBDT: toNumber(order.subtotalBDT ?? order.subtotal_bdt, totalBDT),
    deliveryCharge: toNumber(order.deliveryCharge ?? order.delivery_charge, 0),
    paymentMethod: order.paymentMethod ?? order.payment_method ?? 'COD',
    paymentStatus: order.paymentStatus ?? order.payment_status ?? 'Unpaid',
    fulfillmentStatus: order.fulfillmentStatus ?? order.fulfillment_status ?? 'Unfulfilled',
    // Canonicalised so the status tabs and the status badge always agree — a raw
    // 'in_delivery' from Mongo matched no tab and rendered an empty list.
    status: canonicalStatusOf(order) as Order['status'],
    // `source` is normalised to the UI's display casing ('Manual'/'POS') while
    // the raw Mongo value is preserved on `rawSource` for the server query.
    source: (isManualOrder(order)
      ? (/^pos$/i.test(String(order.source ?? '')) ? 'POS' : 'Manual')
      : (String(order.source ?? 'Store') as any)) as Order['source'],
    isManual: isManualOrder(order),
    createdAt: normalizedCreatedAt,
    items: normalizeOrderItems(order.items),
  } as Order;
}

/** Map a list of raw orders, tolerating a null/undefined payload. */
export function normalizeOrders(raw: unknown): Order[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((o) => normalizeOrder(o));
}

/* ──────────────────── status / source canonicalisation ──────────────────── */

/**
 * Canonicalise an order status to the exact label a status tab expects.
 *
 * WHY
 * ---
 * The status tabs compare with `===` against 'In delivery' / 'Processing
 * reverse' / 'Partially Reversed'. Mongo may hold any of 'in_delivery',
 * 'Out for delivery', 'processing_reverse', 'partially_reversed' or a missing
 * value, and every mismatch silently emptied the tab. This is the client mirror
 * of `canonicalOrderStatus` in `lib/orderStatus.ts`, so the row the filter sees
 * is the row the badge renders.
 */
const STATUS_ALIASES: Record<string, string> = {
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
  processingreverse: 'Processing reverse',
  reversing: 'Processing reverse',
  reverseprocessing: 'Processing reverse',
  partiallyreversed: 'Partially Reversed',
  partialreversed: 'Partially Reversed',
  partiallyreversing: 'Partially Reversed',
  reversed: 'Reversed',
  fullyreversed: 'Reversed',
  refundprocessed: 'Reversed',
};

const statusKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * The status tab a given order belongs to. Falls back through
 * `status` → `order_status` → `fulfillmentStatus`, so a row missing `status`
 * entirely still lands on a tab instead of matching nothing.
 */
export function canonicalStatusOf(ord: any): string {
  const raw = ord?.status ?? ord?.order_status ?? ord?.orderStatus ?? '';
  const text = String(raw || '').trim();
  if (text) {
    const key = statusKey(text);
    return STATUS_ALIASES[key] || text;
  }
  return String(ord?.fulfillmentStatus ?? ord?.fulfillment_status ?? '') === 'Delivered'
    ? 'Completed'
    : 'New';
}

/**
 * True when an order is manually created (dashboard / POS).
 *
 * Checks the explicit `is_manual` / `isManual` flag first, then the `source`
 * and `platform` labels. All three are probed because an order created before
 * the flag existed only has `source`, and one created by an older dashboard
 * build only has the tag.
 */
export function isManualOrder(ord: any): boolean {
  if (!ord) return false;
  if (ord.is_manual === true || ord.isManual === true) return true;
  if (String(ord.is_manual ?? ord.isManual ?? '') === 'true') return true;
  const source = String(ord.source ?? ord.order_source ?? '').trim().toLowerCase();
  if (source === 'manual' || source === 'pos') return true;
  if (String(ord.platform ?? '').trim().toLowerCase() === 'pos') return true;
  if (Array.isArray(ord.tags)) {
    return ord.tags.some((t: string) => ['manual order', 'manual', 'pos'].includes(String(t).trim().toLowerCase()));
  }
  return false;
}
