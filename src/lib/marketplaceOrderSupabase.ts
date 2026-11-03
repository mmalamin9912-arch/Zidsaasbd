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
/*
 * NO SUPABASE CLIENT IMPORT HERE.
 *
 * This module used to hold the browser-side writer and therefore imported the
 * client and the column allow-list. Both are gone: the order is now written by
 * POST /api/orders with the service role, so this file must not touch Supabase
 * at all. Keeping the imports would invite the client path back.
 */

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
  // ── Commission / wallet split (centralized admin payment) ────────────────
  platformFeePercent?: number;
  commissionBdt?: number;
  netAmountBdt?: number;
  adminPaymentMethod?: string;
  adminPaymentNumber?: string;
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
  // Per-vendor split and routing fields (optional, used by server fan-out).
  deliveryZone?: string;
  split_by_vendor?: boolean;
  vendor_ids?: string[];
  vendor_slugs?: string[];
  vendor_count?: number;
  order_source_channel?: string;
  marketplace_order?: boolean;
  // ── Commission / wallet split (centralized admin payment) ────────────────
  /** Platform commission percentage applied (e.g. 10 for 10%). */
  platformFeePercent?: number;
  /** Commission amount in BDT deducted from the vendor's gross. */
  commissionBdt?: number;
  /** Net amount payable to the vendor after commission (gross − commission). */
  netAmountBdt?: number;
  /** Which admin payment method was used (e.g. 'bkash', 'cod', 'nagad', 'rocket'). */
  adminPaymentMethod?: string;
  /** Central admin wallet / merchant number the customer paid into. */
  adminPaymentNumber?: string;
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
 * Persist one marketplace order.
 *
 * ── THE WRITE NOW HAPPENS ON THE SERVER ─────────────────────────────────
 *
 * This used to INSERT into Supabase from the BROWSER with the anon key, which
 * is why the table needed a public read policy and why a schema mismatch
 * surfaced as a client-side PGRST204. Both are gone: the order is written by
 * POST /api/orders with the service-role key, which bypasses Row Level
 * Security — so RLS can stay enabled with NO client policy on `orders` and the
 * browser never talks to Supabase for order data.
 *
 * The signature is unchanged on purpose, so every caller keeps working. The
 * result shape is also unchanged: `ok` still answers "did the order reach the
 * database", and a genuine failure still returns `error`.
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

  const lines = Array.isArray(input.lines) ? input.lines : [];
  if (lines.length === 0) return fail("The basket is empty — nothing to persist.");

  try {
    /*
     * The server route RE-SHAPES this into the real `orders` columns (it knows
     * the deployed schema) and resolves the store uuid, so nothing here needs
     * to know the table layout.
     */
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        orders: [{
          id: input.orderNumber,
          orderNumber: input.orderNumber,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          customerEmail: input.customerEmail,
          district: input.district,
          cityArea: input.cityArea,
          address: input.address,
          customerNote: input.customerNote,
          subtotalBDT: input.subtotalBDT,
          deliveryCharge: input.deliveryCharge,
          totalBDT: input.totalBDT,
          paymentMethod: input.paymentMethod,
          paymentStatus: input.paymentStatus,
          transactionId: input.transactionId,
          deliveryZone: input.deliveryZone,
          split_by_vendor: input.split_by_vendor,
          vendor_ids: input.vendor_ids,
          vendor_slugs: input.vendor_slugs,
          vendor_count: input.vendor_count,
          order_source_channel: input.order_source_channel,
          marketplace_order: input.marketplace_order,
          store_slug: String(lines[0]?.vendor_slug || lines[0]?.store_slug || ""),
          items: lines,
        }],
      }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      return fail(data?.error || `The order could not be saved (HTTP ${res.status}).`, data?.code);
    }

    // Report the Supabase leg of the write, when the server returned it.
    const mirror = Array.isArray(data.supabase) ? data.supabase[0] : null;
    if (mirror && mirror.ok === false) {
      console.warn("[marketplaceOrder] Supabase mirror incomplete:", mirror.error);
    }

    return {
      ok: true,
      orderNumber: input.orderNumber,
      orderId: "",
      // Lines live in `orders.items`; `order_items` is not provisioned here.
      itemRowsWritten: 0,
      itemsJsonOnly: true,
    };
  } catch (err: any) {
    console.warn("[marketplaceOrder] order submission threw:", err?.message || err);
    return fail(err?.message || "The order could not be submitted.");
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

-- RLS: no client policy on orders/order_items.
--
-- The browser no longer writes (or reads) these tables. The order is written by
-- POST /api/orders with the SERVICE ROLE, which bypasses RLS, so checkout keeps
-- working with the table fully closed. The shopper's history is served by
-- /api/customer/supabase-orders (service role + signed session).
--
-- This block previously created orders_insert_anon with check (true) and
-- orders_select_anon using (true). The SELECT policy is what let anyone
-- with the public anon key read every customer's name, phone and address — the
-- exposure Supabase reported. Both are dropped here.
alter table public.orders enable row level security;
drop policy if exists "orders_insert_anon" on public.orders;
drop policy if exists "orders_select_anon" on public.orders;

alter table public.order_items enable row level security;
drop policy if exists "order_items_insert_anon" on public.order_items;
drop policy if exists "order_items_select_anon" on public.order_items;
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
 * SECURITY: this used to query `orders` DIRECTLY from the browser with the anon
 * key, which required a public `select using (true)` policy on the orders table
 * — i.e. every customer's order history was readable by anyone holding the
 * (public) anon key. Row Level Security now blocks that, so the read goes
 * through `/api/customer/supabase-orders`, which uses the service-role key and
 * authorises the request with a signed customer session.
 *
 * The phone supplied by the caller is only used to decide WHETHER to ask; the
 * server resolves the number from the session token, so a caller cannot read
 * another customer's rows. Never throws — a Supabase outage degrades to the
 * server list alone.
 */
export async function fetchSupabaseOrdersForPhone(
  phone: string,
  limit = 100,
): Promise<Record<string, any>[]> {
  const clean = String(phone || '').replace(/\D/g, '');
  if (clean.length < 10) return [];

  try {
    const token = readStoredCustomerToken();
    const res = await fetch(
      `/api/customer/supabase-orders?limit=${encodeURIComponent(String(limit))}`,
      {
        headers: token
          ? { Accept: 'application/json', Authorization: `Bearer ${token}` }
          : { Accept: 'application/json' },
        cache: 'no-store',
      },
    );
    if (res.status === 401) {
      // The shopper has not completed phone verification for this session.
      // History still renders from the server (Mongo) list.
      return [];
    }
    const data = await res.json().catch(() => null);
    const rows = Array.isArray(data?.orders) ? data.orders : [];
    return rows;
  } catch (err: any) {
    console.warn('[marketplaceOrder] Supabase customer orders read threw:', err?.message || err);
    return [];
  }
}

/** The signed session token issued after WhatsApp OTP verification. */
export function readStoredCustomerToken(): string {
  try {
    return String(window.localStorage.getItem('zid_customer_token') || '').trim();
  } catch {
    return '';
  }
}

/** Persist the token returned by the OTP verification endpoint. */
export function storeCustomerToken(token: string): void {
  try {
    if (token) window.localStorage.setItem('zid_customer_token', token);
    else window.localStorage.removeItem('zid_customer_token');
  } catch {
    // Private-mode storage can throw; the session simply does not persist.
  }
}
