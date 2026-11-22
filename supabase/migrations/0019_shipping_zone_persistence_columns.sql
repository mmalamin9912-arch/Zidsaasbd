-- =============================================================================
-- ZID Merchant Dashboard — Delivery Zone / shipping-fee columns on `stores`
-- -----------------------------------------------------------------------------
-- Purpose:
--   "Save Shipping Settings" (Products → Delivery Zones, and COD settings) writes
--   the merchant's whole delivery configuration. Migrations 0013 / 0014 already
--   added the fee columns (`inside_dhaka_fee`, `outside_dhaka_fee`,
--   `sub_dhaka_fee`, `sub_dhaka_areas`, `base_city`, advance-charge columns).
--   The remaining values lived ONLY inside the `shipping_config` JSON blob, so a
--   reader that does not parse the blob (and the Mongo mirror fallback in
--   `readStoreConfig`) had nowhere stable to find them — a saved district or
--   sub-district list could appear to reset on the next page load.
--
--   These columns make every saved value first-class and queryable:
--     base_district                text    (alias of base_city)
--     free_shipping_threshold      numeric (৳ BDT, NULL = offer disabled)
--     max_order_limit              numeric (NULL = no limit)
--     shipping_instruction_notes   text    (checkout delivery note)
--     sub_districts                jsonb   (alias of sub_dhaka_areas)
--     sub_district_fees            jsonb   (optional per-tag custom fee map)
--
--   NULL semantics (identical to 0012–0014, deliberate):
--     • A NULL fee / threshold means "not configured" — NOT 0.
--     • A stored 0 IS a deliberate value and is honoured.
--
-- Design rules (same as the rest of the chain):
--   - Idempotent: ADD COLUMN IF NOT EXISTS. Safe to run repeatedly.
--   - Existing data preserved: new columns start NULL.
--   - Ends with NOTIFY pgrst so PostgREST re-introspects immediately.
-- =============================================================================

BEGIN;

ALTER TABLE IF EXISTS public.stores
  ADD COLUMN IF NOT EXISTS base_district              text,
  ADD COLUMN IF NOT EXISTS free_shipping_threshold    numeric,
  ADD COLUMN IF NOT EXISTS max_order_limit            numeric,
  ADD COLUMN IF NOT EXISTS shipping_instruction_notes text,
  ADD COLUMN IF NOT EXISTS sub_districts              jsonb,
  ADD COLUMN IF NOT EXISTS sub_district_fees          jsonb,
  -- The full saved shipping config, so a reader can rebuild EVERY field
  -- (including per-tag custom fees) without depending on a Mongo blob.
  ADD COLUMN IF NOT EXISTS shipping_config            jsonb;

NOTIFY pgrst, 'reload schema';

COMMIT;
