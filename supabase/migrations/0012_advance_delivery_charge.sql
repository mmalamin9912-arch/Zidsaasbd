-- =============================================================================
-- ZID Merchant Dashboard — Advance Delivery Charge columns on `stores`
-- -----------------------------------------------------------------------------
-- Purpose:
--   The "Advance Delivery Charge" toggle + amount set in Merchant Payment
--   Accounts Setup → COD ("Save COD Rules") were only persisted inside the
--   `shipping_config` / `codConfig` JSON blobs. Readers that look at the
--   dedicated columns (and the public storefront payload) had no stable place
--   to find them, so the checkout could show a stale or ৳0 advance.
--
--   These two columns make the value first-class and queryable:
--     advance_delivery_charge_enabled  boolean  (default false = OFF)
--     advance_amount                   numeric  (৳ BDT, default 0)
--
--   is_cod_enabled is the MASTER Cash on Delivery switch ("Cash on Delivery
--   Configuration" toggle). When false the storefront hides the COD option
--   entirely. It defaults to TRUE so stores that predate the column keep the
--   payment method they have always had.
--
--   The checkout renders the advance box ONLY when
--   `advance_delivery_charge_enabled = true AND advance_amount > 0`.
--   Otherwise it shows "Nothing to pay now — 0 BDT".
--
-- Design rules (same as the rest of the chain):
--   - Idempotent: ADD COLUMN IF NOT EXISTS. Safe to run repeatedly.
--   - Existing data preserved: new columns start false / 0.
--   - Ends with NOTIFY pgrst so PostgREST re-introspects immediately and the
--     mirror PATCH does not 400 from a stale schema cache.
-- =============================================================================

BEGIN;

ALTER TABLE IF EXISTS public.stores
  ADD COLUMN IF NOT EXISTS advance_delivery_charge_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS advance_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_cod_enabled boolean NOT NULL DEFAULT true;

NOTIFY pgrst, 'reload schema';

COMMIT;
