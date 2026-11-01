/**
 * Marketplace order persistence — writes a checkout to the Supabase database.
 *
 * WHY THIS EXISTS
 * ---------------
 * `/marketplace/checkout` used to POST `/api/orders` only. That route writes
 * MongoDB (and a PATCH elsewhere), but it never INSERTs into Supabase — so the
 * Supabase `orders` table stayed empty and the browser's Network tab showed no
 * database write at all when an order was placed.
 *
 * This module is the single place that turns the checkout payload into real
 * Supabase rows.
 *
 * ── THE ACTUAL SCHEMA (verified against the live project) ────────────────────
 * `orders` is NOT the wide table the older native layer assumed. Its columns
 * are exactly:
 *
 *     id               uuid  PRIMARY KEY, default gen_random_uuid()
 *     store_id         uuid  NOT NULL        <- a STORE UUID, not a slug
 *     order_number     text
 *     customer_name    text
 *     customer_phone   text
 *     district         text
 *     city_area        text
 *     shipping_address text
 *     items            TEXT  (a JSON STRING, not jsonb/array)
 *     total_amount     numeric
 *     payment_method   text   default 'COD'
 *     payment_status   text   default 'Unpaid'
 *     order_status     text   default 'New'
 *     created_at       timestamptz default now()
 *
 * There is NO `store_slug`, `vendor_id`, `subtotal_bdt`, `delivery_charge`,
 * `customer_email`, `transaction_id`, `fulfillment_status` or `status` column.
 * Writing any of those 400s the WHOLE insert with PGRST204, which is exactly
 * how a "successful" checkout produced no row. Vendor attribution therefore
 * lives inside the `items` JSON, where each line keeps its `vendor_id` /
 * `vendor_slug` / `vendor_name`.
 *
 * `order_items` does NOT exist in this project (PostgREST answers PGRST205).
 * Writing to it is attempted first — so the child rows are created the moment
 * the table is provisioned — and a missing table degrades to the `orders.items`
 * JSON instead of failing the order.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from './supabase';

/** The `orders` columns this writer may send. Anything else is dropped. */
const ORDER_COLUMNS = [
  'id',
  'store_id',
  'order_number',
  'customer_name',
  'customer_phone',
  'district',
  'city_area',
  'shipping_address',
  'items',
  'total_amount',
  'payment_method',
  'payment_status',
  'order_status',
] as const;

/** One line of the marketplace basket, as the checkout holds it. */
export interface MarketplaceOrderLine {
  productId: string | number;
  productName: string;
  variant?: string;
  quantity: number;
  unitPriceBDT: number;
  image?: string;
  category?: string;
  vendor_id?: string;
  vendor_name?: string;
  vendor_slug?: string;
  store_id?: string;
  store_slug?: string;
}

export interface MarketplaceOrderInput {
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  district: string;
  cityArea: string;
  address: string;
  customerNote?: string;
  subtotalBDT: number;
  deliveryCharge: number;
  totalBDT: number;
  paymentMethod: string;
  paymentStatus: string;
  transactionId?: string;
  lines: MarketplaceOrderLine[];
}

export interface SupabaseOrderResult {
  ok: boolean;
  /** The Supabase row id — the primary key of the order just written. */
  orderId?: string;
  orderNumber?: string;
  /** How many child rows landed in `order_items` (0 when the table is absent). */
  itemRowsWritten: number;
  /** True when `order_items` is not provisioned and lines live in `orders.items`. */
  itemsJsonOnly: boolean;
  /** Present when the write failed entirely (nothing was persisted). */
  error?: string;
  /** PostgREST/PG code of the failure, when there was one. */
  code?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuidLike(value: unknown): boolean {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

/**
 * Resolve a vendor reference to the canonical `stores.id` UUID.
 *
 * `orders.store_id` is a uuid column: inserting a slug there fails with
 * SQLSTATE 22P02 ("invalid input syntax for type uuid") and the order is lost.
 * A reference that already IS a uuid still has to exist in `stores` (the FK),
 * so the row is looked up in both cases.
 *
 * Returns `null` when no store row matches — the caller then falls back to the
 * product's own uuid, and finally to a generated one, so a basket from a store
 * that has not been mirrored into Supabase can still be ordered.
 */
async function resolveStoreUuid(client: SupabaseClient, ref: string): Promise<string | null> {
  const clean = String(ref || '').trim();
  if (!clean) return null;

  // 1) Slug → stores.store_slug (the common case: products carry store_slug).
  try {
    const { data } = await client
      .from('stores')
      .select('id')
      .eq('store_slug', clean.toLowerCase())
      .maybeSingle();
    if (isUuidLike((data as any)?.id)) return String((data as any).id);
  } catch {
    /* column/table missing or RLS — try the uuid form next */
  }

  // 2) Already a uuid → only usable if that store row actually exists.
  if (isUuidLike(clean)) {
    try {
      const { data } = await client.from('stores').select('id').eq('id', clean).maybeSingle();
      if (isUuidLike((data as any)?.id)) return String((data as any).id);
    } catch {
      /* fall through */
    }
  }

  return null;
}

function newUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // RFC 4122 v4 fallback for older engines.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Does PostgREST say this is a MISSING TABLE (as opposed to a bad payload)?
 *
 * PGRST205 = "Could not find the table". `order_items` is not provisioned in
 * this project, and that must not fail an order that already landed in
 * `orders`.
 */
function isMissingTable(err: any): boolean {
  const code = String(err?.code || '');
  const message = String(err?.message || '');
  return code === 'PGRST205' || /could not find the table/i.test(message);
}

/**
 * Persist one marketplace order to Supabase.
 *
 * Order of operations:
 *   1. Resolve the shipping store uuid (never send a slug into a uuid column).
 *   2. INSERT the master row into `orders` with ONLY real columns.
 *   3. Best-effort INSERT the per-line rows into `order_items`, skipping the
 *      step (not failing) when that table is not provisioned.
 *
 * Never throws — the caller gets `{ ok, error }` and decides what to show the
 * shopper.
 */
export async function createMarketplaceOrderInSupabase(
  input: MarketplaceOrderInput,
): Promise<SupabaseOrderResult> {
  const fail = (error: string, code?: string): SupabaseOrderResult => ({
    ok: false,
    itemRowsWritten: 0,
    itemsJsonOnly: false,
    error,
    code,
  });

  if (!isSupabaseConfigured) return fail('Supabase is not configured on this deployment.');
  const client = getSupabaseClient();
  if (!client) return fail('Supabase client unavailable.');

  const lines = Array.isArray(input.lines) ? input.lines : [];
  if (lines.length === 0) return fail('The basket is empty — nothing to persist.');

  // ── 1. store uuid ────────────────────────────────────────────────────────
  const primaryLine = lines[0];
  const storeRef =
    String(primaryLine?.store_id || primaryLine?.vendor_id || '').trim() ||
    String(primaryLine?.store_slug || primaryLine?.vendor_slug || '').trim();

  const resolved = storeRef ? await resolveStoreUuid(client, storeRef) : null;
  const storeId = resolved || (isUuidLike(storeRef) ? storeRef : newUuid());

  // ── 2. the master row ────────────────────────────────────────────────────
  // `items` is TEXT: store the JSON STRING, not an array — an array is coerced
  // to `{...}` and reads back unparseable.
  const itemsForJson = lines.map((line) => ({
    productId: line.productId,
    productName: line.productName,
    variant: line.variant || 'Standard',
    quantity: Number(line.quantity) || 1,
    unitPriceBDT: Number(line.unitPriceBDT) || 0,
    image: line.image || '',
    category: line.category || '',
    vendor_id: line.vendor_id || line.store_id || '',
    vendor_name: line.vendor_name || '',
    vendor_slug: line.vendor_slug || line.store_slug || '',
  }));

  const row: Record<string, any> = {
    store_id: storeId,
    order_number: input.orderNumber,
    customer_name: input.customerName,
    customer_phone: input.customerPhone,
    district: input.district || '',
    city_area: input.cityArea || '',
    shipping_address: input.address || '',
    items: JSON.stringify(itemsForJson),
    total_amount: Number(input.totalBDT) || 0,
    payment_method: input.paymentMethod || 'COD',
    payment_status: input.paymentStatus || 'Unpaid',
    order_status: 'New',
  };

  // Defensive: never send a key the table does not have (PGRST204 kills the row).
  for (const key of Object.keys(row)) {
    if (!(ORDER_COLUMNS as readonly string[]).includes(key)) delete row[key];
  }

  let inserted: any = null;
  try {
    const { data, error } = await client
      .from('orders')
      // @ts-ignore — dynamic column object; the column list above is the contract.
      .insert(row)
      .select('id, order_number')
      .single();

    if (error) {
      const code = String((error as any)?.code || '');
      console.warn('[marketplaceOrder] Supabase orders insert failed:', code, error.message);
      return fail(error.message || 'Order could not be saved in Supabase.', code || undefined);
    }
    inserted = data;
  } catch (err: any) {
    console.warn('[marketplaceOrder] Supabase orders insert threw:', err?.message || err);
    return fail(err?.message || 'Order could not be saved in Supabase.');
  }

  const orderId = String((inserted as any)?.id || '');

  // ── 3. per-line rows (best effort) ───────────────────────────────────────
  if (!orderId) {
    // The order IS saved; without its id the children cannot be linked.
    return {
      ok: true,
      orderNumber: input.orderNumber,
      itemRowsWritten: 0,
      itemsJsonOnly: true,
    };
  }

  const itemRows = itemsForJson.map((line) => ({
    order_id: orderId,
    order_number: input.orderNumber,
    product_id: isUuidLike(line.productId) ? line.productId : String(line.productId),
    product_name: line.productName,
    variant: line.variant,
    quantity: line.quantity,
    unit_price_bdt: line.unitPriceBDT,
    image: line.image || null,
    vendor_id: line.vendor_id || null,
    vendor_name: line.vendor_name || null,
    vendor_slug: line.vendor_slug || null,
    store_id: storeId,
    store_slug: line.vendor_slug || null,
    category: line.category || null,
  }));

  try {
    const { error: itemsError } = await client.from('order_items').insert(itemRows as any);
    if (!itemsError) {
      return { ok: true, orderId, orderNumber: input.orderNumber, itemRowsWritten: itemRows.length, itemsJsonOnly: false };
    }
    if (isMissingTable(itemsError)) {
      // Expected until `order_items` is provisioned — the lines are in
      // `orders.items`, so the order itself is complete and correct.
      console.info(
        '[marketplaceOrder] `order_items` table is not provisioned; lines stored in orders.items JSON.',
      );
      return { ok: true, orderId, orderNumber: input.orderNumber, itemRowsWritten: 0, itemsJsonOnly: true };
    }
    console.warn('[marketplaceOrder] Supabase order_items insert failed:', itemsError.message);
    return { ok: true, orderId, orderNumber: input.orderNumber, itemRowsWritten: 0, itemsJsonOnly: true };
  } catch (err: any) {
    console.warn('[marketplaceOrder] Supabase order_items insert threw:', err?.message || err);
    return { ok: true, orderId, orderNumber: input.orderNumber, itemRowsWritten: 0, itemsJsonOnly: true };
  }
}

/**
 * The `order_items` provisioning statement.
 *
 * Kept next to the writer so the contract cannot drift from the code: until
 * this SQL is applied to the project, step 3 above is skipped and lines live
 * in `orders.items`. `orders.store_id` and `orders.id` are uuid, so
 * `product_id` is text (product ids are bigint and of mixed provenance) and
 * everything vendor-related is denormalised on purpose — a child row must stay
 * readable after a product or store is deleted.
 */
export const ORDER_ITEMS_MIGRATION_SQL = `
create table if not exists public.order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders(id) on delete cascade,
  order_number     text,
  product_id       text,
  product_name     text,
  variant          text,
  quantity         integer not null default 1,
  unit_price_bdt   numeric not null default 0,
  image            text,
  vendor_id        text,
  vendor_name      text,
  vendor_slug      text,
  store_id         uuid,
  store_slug       text,
  category         text,
  created_at       timestamptz not null default now()
);

create index if not exists order_items_order_id_idx on public.order_items (order_id);
create index if not exists order_items_vendor_id_idx on public.order_items (vendor_id);

/*
 * Orders are inserted by the storefront with the public anon key, so the
 * orders table needs an INSERT policy too — without it PostgREST answers 401
 * and the checkout has nowhere to write. Kept narrow: insert + read, never
 * update or delete from the client.
 */
alter table public.orders enable row level security;
drop policy if exists "orders_insert_anon" on public.orders;
create policy "orders_insert_anon"
  on public.orders for insert to anon, authenticated with check (true);
drop policy if exists "orders_select_anon" on public.orders;
create policy "orders_select_anon"
  on public.orders for select to anon, authenticated using (true);

alter table public.order_items enable row level security;
drop policy if exists "order_items_insert_anon" on public.order_items;
create policy "order_items_insert_anon"
  on public.order_items for insert to anon, authenticated with check (true);
drop policy if exists "order_items_select_anon" on public.order_items;
create policy "order_items_select_anon"
  on public.order_items for select to anon, authenticated using (true);
`;

/**
 * Read a shopper's own orders from Supabase.
 *
 * The customer history page (`/marketplace/orders`) reads `/api/customer/orders`,
 * which is served from MongoDB. Since the checkout now writes to Supabase, an
 * order placed there would otherwise be visible to the merchant but invisible
 * to the shopper who placed it. This returns the Supabase rows for that phone
 * so the page can merge them with the server list.
 *
 * Scoped by phone number and capped: it is used to fill a gap, not to page
 * through history. Never throws — a Supabase outage degrades to the server
 * list alone.
 */
export async function fetchSupabaseOrdersForPhone(
  phone: string,
  limit = 100,
): Promise<Record<string, any>[]> {
  const clean = String(phone || '').replace(/\D/g, '');
  if (clean.length < 10) return [];
  if (!isSupabaseConfigured) return [];
  const client = getSupabaseClient();
  if (!client) return [];

  // Compare on digits so "+8801700…" and "01700…" resolve to the same rows.
  const last10 = clean.slice(-10);
  const candidates = Array.from(new Set([clean, last10, `0${last10}`]));

  try {
    const { data, error } = await client
      .from('orders')
      .select('id, store_id, order_number, customer_name, customer_phone, district, city_area, shipping_address, items, total_amount, payment_method, payment_status, order_status, created_at')
      .in('customer_phone', candidates)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('[marketplaceOrder] Supabase customer orders read failed:', error.message);
      return [];
    }
    return Array.isArray(data) ? data : [];
  } catch (err: any) {
    console.warn('[marketplaceOrder] Supabase customer orders read threw:', err?.message || err);
    return [];
  }
}
