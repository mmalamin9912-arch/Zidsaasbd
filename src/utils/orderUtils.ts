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
    status: order.status ?? 'New',
    createdAt: normalizedCreatedAt,
    items: normalizeOrderItems(order.items),
  } as Order;
}

/** Map a list of raw orders, tolerating a null/undefined payload. */
export function normalizeOrders(raw: unknown): Order[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((o) => normalizeOrder(o));
}
