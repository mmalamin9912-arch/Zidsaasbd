-- =============================================================================
-- ZID Merchant Dashboard — store CONTACT / PICKUP columns on Supabase `stores`
-- Migration: 0020_stores_contact_pickup_columns.sql
-- =============================================================================
-- Symptom this fixes
-- ------------------
-- Every merchant profile save logs:
--
--   [postgrestWrite] Dropped unknown column "support_contact" from stores payload.
--   [postgrestWrite] Dropped unknown column "support_phone" from stores payload.
--   [postgrestWrite] Dropped unknown column "pickup_address" from stores payload.
--   [postgrestWrite] Dropped unknown column "shop_address" from stores payload.
--   [postgrestWrite] Dropped unknown column "whatsapp_number" from stores payload.
--   [postgrestWrite] Dropped unknown column "address" from stores payload.
--   [postgrestWrite] Dropped unknown column "status" from stores payload.
--   [postgrestWrite] Dropped unknown column "supportContact" (camelCase) ...
--
-- Why it happens
-- --------------
-- `/api/stores/update` forwards the merchant's contact + pickup fields to the
-- Supabase `stores` mirror (see the `allowed` list in lib/serverApp.ts). Those
-- columns were never declared by ANY migration: 0017 only re-asserted the
-- COD / delivery-fee / subscription columns. PostgREST answers PGRST204
-- ("Could not find the column ... in the schema cache"), `postgrestWrite`
-- removes the column and retries — so the save "succeeds" while the merchant's
-- support phone, pickup address and shop address are silently DISCARDED on the
-- Supabase side, and any reader of the fallback store sees stale/empty contact
-- data.
--
-- The camelCase spellings (`supportContact`, `pickupAddress`, `storeAddress`,
-- `shopAddress`, `whatsappNumber`) are also accepted by that mirror, so a
-- quoted "…Address" column is created for each of them as well. Postgres folds
-- unquoted identifiers to lower case, so the quoted form is required to keep the
-- exact camelCase name the payload uses.
--
-- Design rules (same as the rest of the chain):
--   - Idempotent: every statement is safe to re-run.
--   - Non-destructive: only ADD COLUMN; no existing column, row or constraint is
--     altered or dropped, and existing data is preserved. MongoDB remains the
--     source of truth — this only lets the mirror land.
--   - Ends with NOTIFY pgrst so PostgREST re-introspects immediately instead of
--     answering PGRST204 from a stale schema cache.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Contact fields (support phone / WhatsApp) — snake_case.
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.stores
  ADD COLUMN IF NOT EXISTS support_contact text,
  ADD COLUMN IF NOT EXISTS support_phone   text,
  ADD COLUMN IF NOT EXISTS contact_phone   text,
  ADD COLUMN IF NOT EXISTS whatsapp_number text;

-- -----------------------------------------------------------------------------
-- 2. Pickup / shop address fields — snake_case.
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.stores
  ADD COLUMN IF NOT EXISTS pickup_address  text,
  ADD COLUMN IF NOT EXISTS store_address   text,
  ADD COLUMN IF NOT EXISTS shop_address    text,
  ADD COLUMN IF NOT EXISTS business_address text,
  ADD COLUMN IF NOT EXISTS address         text;

-- -----------------------------------------------------------------------------
-- 3. Account status written by the profile save.
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.stores
  ADD COLUMN IF NOT EXISTS status text;

-- -----------------------------------------------------------------------------
-- 4. The camelCase spellings the same mirror payload may carry.
--    Quoted, so Postgres keeps the exact mixed-case name the payload uses.
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.stores
  ADD COLUMN IF NOT EXISTS "supportContact" text,
  ADD COLUMN IF NOT EXISTS "supportPhone"   text,
  ADD COLUMN IF NOT EXISTS "contactPhone"   text,
  ADD COLUMN IF NOT EXISTS "whatsappNumber" text,
  ADD COLUMN IF NOT EXISTS "pickupAddress"  text,
  ADD COLUMN IF NOT EXISTS "storeAddress"   text,
  ADD COLUMN IF NOT EXISTS "shopAddress"    text,
  ADD COLUMN IF NOT EXISTS "businessAddress" text,
  ADD COLUMN IF NOT EXISTS "storeDistrict"  text,
  ADD COLUMN IF NOT EXISTS "baseDistrict"   text;

-- -----------------------------------------------------------------------------
-- 5. Report anything still missing (informational, never fails).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  col record;
  actual text;
BEGIN
  FOR col IN
    SELECT * FROM (VALUES
      ('support_contact'), ('support_phone'), ('contact_phone'), ('whatsapp_number'),
      ('pickup_address'), ('store_address'), ('shop_address'), ('business_address'),
      ('address'), ('status'),
      ('supportContact'), ('supportPhone'), ('contactPhone'), ('whatsappNumber'),
      ('pickupAddress'), ('storeAddress'), ('shopAddress'), ('businessAddress'),
      ('storeDistrict'), ('baseDistrict')
    ) AS t(name)
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
      RAISE NOTICE 'stores.% is MISSING (expected text)', col.name;
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
-- 1. All columns present (expect 20 rows, none missing):
--      SELECT column_name, data_type
--        FROM information_schema.columns
--       WHERE table_schema = 'public' AND table_name = 'stores'
--         AND column_name IN ('support_contact','support_phone','contact_phone',
--               'whatsapp_number','pickup_address','store_address','shop_address',
--               'business_address','address','status','supportContact',
--               'supportPhone','contactPhone','whatsappNumber','pickupAddress',
--               'storeAddress','shopAddress','businessAddress','storeDistrict',
--               'baseDistrict')
--       ORDER BY column_name;
--
-- 2. Save a merchant's profile, then confirm the contact fields landed:
--      SELECT store_slug, support_contact, pickup_address, whatsapp_number
--        FROM public.stores ORDER BY updated_at DESC LIMIT 5;
--
-- 3. The runtime log must no longer print
--      [postgrestWrite] Dropped unknown column "…" from stores payload.
-- =============================================================================
