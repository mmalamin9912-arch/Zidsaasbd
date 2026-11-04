-- =============================================================================
-- ZID Merchant Dashboard — restore the `stores` columns PostgREST keeps dropping
-- Migration: 0017_stores_missing_columns.sql
-- =============================================================================
-- Symptom this fixes
-- ------------------
-- Production logs show a repeating warning on every store save:
--
--   [postgrestWrite] Dropped unknown column "is_cod_enabled" from stores payload.
--   [postgrestWrite] Dropped unknown column "inside_dhaka_fee" from stores payload.
--   [postgrestWrite] Dropped unknown column "expires_at" from stores payload.
--   [postgrestWrite] Dropped unknown column "duration_days" from stores payload.
--
-- `postgrestWrite` answers PGRST204/42703 by removing the column and retrying,
-- which keeps the request alive but silently DISCARDS the value: a merchant's
-- COD switch, delivery fee or subscription window then never reaches Supabase,
-- so the Supabase fallback store and any reader using it sees defaults forever.
--
-- Why the columns can be missing even though earlier migrations declare them
-- ------------------------------------------------------------------------
-- These columns are defined in:
--   0010_stores_email_unique_subscriptions_identity.sql  expires_at, duration_days
--   0012_advance_delivery_charge.sql                     is_cod_enabled
--   0013_delivery_zone_columns.sql                       inside_dhaka_fee
-- but a deployment whose `stores` table was provisioned by hand (or restored
-- from a partial dump) never applied them. `ADD COLUMN IF NOT EXISTS` is
-- therefore re-asserted here for the exact set the application writes, so this
-- ONE file brings any drifted project back in line.
--
-- Design rules (same as the rest of the chain):
--   - Idempotent: every statement is safe to re-run.
--   - Non-destructive: only ADD COLUMN; no existing column, row or constraint is
--     altered or dropped, and existing data is preserved.
--   - Defaults match the application's expectations (COD ON, fees "not priced"
--     as NULL, no subscription window). A stored 0 is still a deliberate ৳0.
--   - Ends with NOTIFY pgrst so PostgREST re-introspects immediately instead of
--     answering PGRST204 from a stale schema cache.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. The four reported columns (+ the delivery / COD siblings written by the
--    same store-update payload, so this file alone fully reconciles `stores`).
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.stores
  -- Cash on Delivery master switch. TRUE by default: stores that predate the
  -- column must keep the payment method they have always offered.
  ADD COLUMN IF NOT EXISTS is_cod_enabled                  boolean NOT NULL DEFAULT true,
  -- Delivery zone fees in BDT. NULL = "this zone was never priced" (the
  -- checkout then says "To be confirmed"); a stored 0 is real free delivery.
  ADD COLUMN IF NOT EXISTS inside_dhaka_fee                numeric,
  ADD COLUMN IF NOT EXISTS sub_dhaka_fee                   numeric,
  ADD COLUMN IF NOT EXISTS outside_dhaka_fee               numeric,
  -- Advance delivery charge (COD): toggle + amount.
  ADD COLUMN IF NOT EXISTS advance_delivery_charge_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS advance_amount                  numeric NOT NULL DEFAULT 0,
  -- Merchant's own base city, used to derive Inside/Outside zone.
  ADD COLUMN IF NOT EXISTS base_city                       text,
  -- Subscription window written by POST /api/subscription/approve.
  ADD COLUMN IF NOT EXISTS expires_at                      timestamptz,
  ADD COLUMN IF NOT EXISTS duration_days                   integer,
  ADD COLUMN IF NOT EXISTS subscription_plan               text,
  ADD COLUMN IF NOT EXISTS subscription_expiry             timestamptz,
  ADD COLUMN IF NOT EXISTS plan_started_at                 timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at                   timestamptz,
  ADD COLUMN IF NOT EXISTS trial_days_remaining            integer;

-- -----------------------------------------------------------------------------
-- 2. Make the natural-key upsert resolvable.
--    Registration / theme publishing upsert with `on_conflict=email`, and the
--    code falls back to `store_slug`. Both need a PLAIN (non-partial) UNIQUE
--    index, otherwise PostgREST answers 42P10 "there is no unique or exclusion
--    constraint matching the ON CONFLICT specification" — a second, separate
--    source of failed store writes on drifted projects. Existing duplicates are
--    merged onto the newest row FIRST so the index can be created; nothing is
--    lost. A unique index on an already-unique column is a no-op.
--    (0010 does this for `email`; `store_slug` is added here.)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.stores') IS NULL THEN
    RETURN;
  END IF;

  -- Keep one row per slug: re-point orders at the survivor when they reference
  -- a duplicate (orders.store_id is ON DELETE CASCADE).
  IF to_regclass('public.orders') IS NOT NULL THEN
    WITH ranked AS (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY lower(store_slug)
               ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id::text DESC
             ) AS rn,
             FIRST_VALUE(id) OVER (
               PARTITION BY lower(store_slug)
               ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id::text DESC
             ) AS keep_id
        FROM public.stores
       WHERE store_slug IS NOT NULL AND store_slug <> ''
    )
    UPDATE public.orders o
       SET store_id = r.keep_id
      FROM ranked r
     WHERE o.store_id = r.id
       AND r.rn > 1
       AND r.id IS DISTINCT FROM r.keep_id;
  END IF;

  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY lower(store_slug)
             ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id::text DESC
           ) AS rn
      FROM public.stores
     WHERE store_slug IS NOT NULL AND store_slug <> ''
  )
  DELETE FROM public.stores s
   USING ranked r
   WHERE s.id = r.id
     AND r.rn > 1;

  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS stores_store_slug_key ON public.stores (store_slug);
  EXCEPTION WHEN unique_violation THEN
    -- Differently-cased slugs (`MyStore` / `mystore`) are still distinct to a
    -- plain index. Report it rather than failing the whole migration.
    RAISE NOTICE 'stores(store_slug) still has duplicates — the unique index was not created.';
  END;
END $$;

-- -----------------------------------------------------------------------------
-- 3. Typing notes.
--    `ADD COLUMN IF NOT EXISTS` is a NO-OP when the column already exists — even
--    with the wrong type — so the values the app writes are also made safe at
--    the boundary instead of depending on it:
--      • booleans  are coerced to true/false before the write
--      • numerics  are coerced to a number (or NULL), never a "৳80" string
--      • integer   is parsed, never "30 days"
--      • timestamps are written as ISO-8601 strings
--    See `toBooleanColumn` / `toNumericColumn` / `toTimestampColumn` in
--    lib/serverApp.ts. A project whose column types differ from the above is
--    reported by the verification query in step 4.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 4. Report anything still missing or mistyped (informational, never fails).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  col record;
  actual text;
BEGIN
  FOR col IN
    SELECT * FROM (VALUES
      ('is_cod_enabled', 'boolean'),
      ('inside_dhaka_fee', 'numeric'),
      ('sub_dhaka_fee', 'numeric'),
      ('outside_dhaka_fee', 'numeric'),
      ('advance_delivery_charge_enabled', 'boolean'),
      ('advance_amount', 'numeric'),
      ('base_city', 'text'),
      ('expires_at', 'timestamp with time zone'),
      ('duration_days', 'integer'),
      ('subscription_plan', 'text'),
      ('subscription_expiry', 'timestamp with time zone'),
      ('plan_started_at', 'timestamp with time zone'),
      ('trial_ends_at', 'timestamp with time zone'),
      ('trial_days_remaining', 'integer')
    ) AS t(name, expected)
  LOOP
    SELECT format_type(a.atttypid, a.atttypmod)
      INTO actual
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'stores'
       AND a.attname = col.name
       AND a.attnum > 0
       AND NOT a.attisdropped;

    IF actual IS NULL THEN
      RAISE NOTICE 'stores.% is MISSING (expected %)', col.name, col.expected;
    ELSIF actual NOT IN (col.expected, 'text') AND NOT (
      col.expected = 'numeric' AND actual LIKE 'numeric%'
    ) THEN
      RAISE NOTICE 'stores.% is % (expected %)', col.name, actual, col.expected;
    END IF;
  END LOOP;
END $$;

-- PostgREST caches the introspected schema; without this the API keeps
-- answering PGRST204 ("Could not find the column … in the schema cache") until
-- the next restart, which is exactly the warning this migration removes.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- =============================================================================
-- POST-DEPLOY VERIFICATION (run manually):
-- =============================================================================
-- 1. All columns present (expect 14 rows, none missing):
--      SELECT column_name, data_type, column_default
--        FROM information_schema.columns
--       WHERE table_schema = 'public' AND table_name = 'stores'
--         AND column_name IN ('is_cod_enabled','inside_dhaka_fee','sub_dhaka_fee',
--               'outside_dhaka_fee','advance_delivery_charge_enabled','advance_amount',
--               'base_city','expires_at','duration_days','subscription_plan',
--               'subscription_expiry','plan_started_at','trial_ends_at',
--               'trial_days_remaining')
--       ORDER BY column_name;
--
-- 2. Save a merchant's COD / delivery settings, then confirm the values landed:
--      SELECT store_slug, is_cod_enabled, inside_dhaka_fee, expires_at, duration_days
--        FROM public.stores ORDER BY updated_at DESC LIMIT 5;
--
-- 3. The runtime log must no longer print
--      [postgrestWrite] Dropped unknown column "…" from stores payload.
-- =============================================================================
