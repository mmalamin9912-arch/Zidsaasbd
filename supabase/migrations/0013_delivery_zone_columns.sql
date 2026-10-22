-- =============================================================================
-- ZID Merchant Dashboard — Canonical delivery-fee columns on `stores`
-- -----------------------------------------------------------------------------
-- Purpose:
--   The merchant's delivery fees, advance-delivery-charge toggle and amount
--   were only ever persisted inside the `shipping_config` / `codConfig` JSON
--   blobs. Readers that look at dedicated COLUMNS (and the public storefront
--   payload) had no stable place to find them, so the checkout could quote a
--   stale fee, or invent a ৳80 / ৳150 fallback that the merchant never set.
--
--   These columns make every value first-class and queryable:
--     inside_dhaka_fee                 numeric  (৳ BDT, Inside-City fee)
--     outside_dhaka_fee                numeric  (৳ BDT, Outside-City fee)
--     advance_delivery_charge_enabled  boolean  (default false = OFF)
--     advance_amount                   numeric  (৳ BDT, default 0)
--     is_cod_enabled                   boolean  (default true = ON)
--     base_city                        text     (merchant's own city/district)
--
--   `base_city` is what makes the checkout's zone validation honest: the
--   customer picks a district and the zone ("Inside City" vs "Outside City")
--   is derived from it, so an out-of-city customer can never tick the
--   cheaper Inside-City option.
--
--   NULL semantics (deliberate):
--     • A NULL fee means "this zone was never priced" — NOT ৳0. The
--       storefront renders "To be confirmed" instead of a phantom ৳0.
--     • A stored 0 IS a deliberate "free delivery" and is honoured as ৳0.
--
-- Design rules (same as the rest of the chain):
--   - Idempotent: ADD COLUMN IF NOT EXISTS. Safe to run repeatedly.
--   - Existing data preserved: new columns start NULL / false / true.
--   - Ends with NOTIFY pgrst so PostgREST re-introspects immediately and the
--     mirror PATCH does not 400 from a stale schema cache.
-- =============================================================================

BEGIN;

ALTER TABLE IF EXISTS public.stores
  ADD COLUMN IF NOT EXISTS inside_dhaka_fee                numeric,
  ADD COLUMN IF NOT EXISTS outside_dhaka_fee               numeric,
  ADD COLUMN IF NOT EXISTS advance_delivery_charge_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS advance_amount                  numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_cod_enabled                  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS base_city                       text;

NOTIFY pgrst, 'reload schema';

COMMIT;
