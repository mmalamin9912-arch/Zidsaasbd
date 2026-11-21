-- =============================================================================
-- ZID Merchant Dashboard — public.courier_orders (the "Courier Orders List")
-- Migration: 0018_courier_orders.sql
-- =============================================================================
-- Symptom this fixes
-- ------------------
-- Production logs showed, on every "Send to Courier" click:
--
--   GET  /api/admin/courier-orders -> 0 orders (ledger: 0, mongo: 0, cached: 0)
--
-- even though the Telegram alert fired. The ledger code writes to
-- `public.courier_orders`, but NO MIGRATION EVER CREATED THAT TABLE, so every
-- PostgREST write answered `PGRST205: Could not find the table
-- 'public.courier_orders' in the schema cache`. The fallback into
-- `platform_config` (config_key = 'courier_order:<order>') then carried the row,
-- which is why some installs saw rows and others saw none.
--
-- This migration creates the real table so a dispatch attempt is one durable,
-- queryable row per order.
--
-- Design rules (same as the rest of the chain):
--   - Idempotent: every statement is safe to re-run.
--   - Non-destructive: CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS.
--   - `id` is TEXT (the lower-cased order number) — NOT bigint — so an upsert
--     on the natural key can never raise 22P02 "invalid input syntax for type
--     bigint". This is the same class of bug the store mirror hit.
--   - RLS on, with a service-role policy; the server writes with the
--     service-role key (see lib/supabaseSchema.ts -> postgrestWrite).
--   - Ends with NOTIFY pgrst so PostgREST re-introspects immediately.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.courier_orders (
  -- The lower-cased order number (e.g. 'zid-507745498').
  id                       text PRIMARY KEY,
  order_id                 text,
  order_number             text,

  -- Store / merchant identity (what the Admin list renders).
  store_slug               text,
  store_code               text,
  store_id                 text,
  store_name               text,
  merchant_name            text,
  merchant_phone           text,
  pickup_address           text,

  -- Customer.
  customer_name            text,
  customer_phone           text,
  customer_address         text,
  shipping_address         text,
  customer_city            text,

  -- Money / payment.
  amount                   numeric,
  total_price              numeric,
  payment_method           text,
  payment_status           text,

  -- Courier.
  courier_name             text,
  courier_key              text,
  courier_status           text NOT NULL DEFAULT 'sent_to_courier',
  courier_status_updated_at timestamptz,
  courier_booked           boolean NOT NULL DEFAULT false,
  courier_booked_at        timestamptz,
  needs_manual_entry       boolean NOT NULL DEFAULT true,
  courier_last_error       text,
  courier_response         text,

  -- Tracking (several spellings, because different readers use different ones).
  tracking_id              text,
  tracking_code            text,
  courier_tracking         text,
  consignment_id           text,

  -- Labels are base64 JSON text, exactly like the Mongo implementation.
  courier_labels           text NOT NULL DEFAULT '[]',

  -- Book-keeping.
  items                    text NOT NULL DEFAULT '[]',
  admin_visible            boolean NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- Re-assert every column for projects whose table was created by hand from an
-- older payload shape (ADD COLUMN IF NOT EXISTS is a no-op when it exists).
ALTER TABLE public.courier_orders
  ADD COLUMN IF NOT EXISTS order_id                 text,
  ADD COLUMN IF NOT EXISTS order_number             text,
  ADD COLUMN IF NOT EXISTS store_slug               text,
  ADD COLUMN IF NOT EXISTS store_code               text,
  ADD COLUMN IF NOT EXISTS store_id                 text,
  ADD COLUMN IF NOT EXISTS store_name               text,
  ADD COLUMN IF NOT EXISTS merchant_name            text,
  ADD COLUMN IF NOT EXISTS merchant_phone           text,
  ADD COLUMN IF NOT EXISTS pickup_address           text,
  ADD COLUMN IF NOT EXISTS customer_name            text,
  ADD COLUMN IF NOT EXISTS customer_phone           text,
  ADD COLUMN IF NOT EXISTS customer_address         text,
  ADD COLUMN IF NOT EXISTS shipping_address         text,
  ADD COLUMN IF NOT EXISTS customer_city            text,
  ADD COLUMN IF NOT EXISTS amount                   numeric,
  ADD COLUMN IF NOT EXISTS total_price              numeric,
  ADD COLUMN IF NOT EXISTS payment_method           text,
  ADD COLUMN IF NOT EXISTS payment_status           text,
  ADD COLUMN IF NOT EXISTS courier_name             text,
  ADD COLUMN IF NOT EXISTS courier_key              text,
  ADD COLUMN IF NOT EXISTS courier_status           text,
  ADD COLUMN IF NOT EXISTS courier_status_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS courier_booked           boolean,
  ADD COLUMN IF NOT EXISTS courier_booked_at        timestamptz,
  ADD COLUMN IF NOT EXISTS needs_manual_entry       boolean,
  ADD COLUMN IF NOT EXISTS courier_last_error       text,
  ADD COLUMN IF NOT EXISTS courier_response         text,
  ADD COLUMN IF NOT EXISTS tracking_id              text,
  ADD COLUMN IF NOT EXISTS tracking_code            text,
  ADD COLUMN IF NOT EXISTS courier_tracking         text,
  ADD COLUMN IF NOT EXISTS consignment_id           text,
  ADD COLUMN IF NOT EXISTS courier_labels           text,
  ADD COLUMN IF NOT EXISTS items                    text,
  ADD COLUMN IF NOT EXISTS admin_visible            boolean,
  ADD COLUMN IF NOT EXISTS created_at               timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at               timestamptz;

-- The Admin list sorts by `updated_at desc` and filters by store / status.
CREATE INDEX IF NOT EXISTS courier_orders_updated_at_idx ON public.courier_orders (updated_at DESC);
CREATE INDEX IF NOT EXISTS courier_orders_store_idx      ON public.courier_orders (store_slug);
CREATE INDEX IF NOT EXISTS courier_orders_status_idx     ON public.courier_orders (courier_status);
CREATE INDEX IF NOT EXISTS courier_orders_number_idx     ON public.courier_orders (order_number);

ALTER TABLE public.courier_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS courier_orders_service_all ON public.courier_orders;
CREATE POLICY courier_orders_service_all
  ON public.courier_orders
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

-- PostgREST caches the introspected schema; without this the API keeps
-- answering PGRST205 until the next restart.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- =============================================================================
-- POST-DEPLOY VERIFICATION (run manually):
-- =============================================================================
-- 1. The table exists:
--      SELECT column_name, data_type
--        FROM information_schema.columns
--       WHERE table_schema = 'public' AND table_name = 'courier_orders'
--       ORDER BY column_name;
--
-- 2. Click "Send to Courier" once, then:
--      SELECT id, store_slug, customer_name, amount, payment_method,
--             courier_status, courier_last_error, updated_at
--        FROM public.courier_orders
--       ORDER BY updated_at DESC LIMIT 5;
--
-- 3. The Render log must show, for each click:
--      [CourierLedger] table write OK for order zid-…
-- =============================================================================
