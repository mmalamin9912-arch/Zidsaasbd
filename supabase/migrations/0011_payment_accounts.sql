-- =============================================================================
-- ZID Merchant Dashboard — Merchant payment accounts on `stores`
-- -----------------------------------------------------------------------------
-- Purpose:
--   POST /api/store/payment-accounts persists the Merchant Payment Accounts
--   Setup edits (bKash / Nagad / Rocket toggles + account numbers, and the
--   checkout-visible bank accounts). MongoDB is the durable copy the server
--   writes first; the same payload is mirrored into these snake_case jsonb
--   columns so the public storefront read
--   (GET /api/storefront/:slug -> lookupStoreRecord -> Supabase REST first)
--   returns the merchant's ACTIVE payment methods to any customer device.
--
--   Before this migration a Supabase `stores` row carried no payment columns
--   at all, so the mirror was silently dropped (PGRST204) and the checkout
--   fell back to a stale localStorage copy — customers never saw the
--   merchant's real bKash / Nagad / Rocket numbers.
--
-- Design rules (same as the rest of the chain):
--   - Idempotent: ADD COLUMN IF NOT EXISTS. Safe to run repeatedly.
--   - Existing data is preserved: new columns start NULL; every reader treats
--     NULL the same as "no payment accounts configured yet".
--   - Ends with NOTIFY pgrst, 'reload schema' so PostgREST re-introspects
--     immediately instead of answering 400 from a stale schema cache.
-- =============================================================================

BEGIN;

ALTER TABLE IF EXISTS public.stores
  ADD COLUMN IF NOT EXISTS mobile_banking jsonb,
  ADD COLUMN IF NOT EXISTS bank_accounts  jsonb;

NOTIFY pgrst, 'reload schema';

COMMIT;
