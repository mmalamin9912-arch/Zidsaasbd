-- =============================================================================
-- ZID Merchant Dashboard — Sub-Dhaka / Dhaka-suburbs delivery fee column
-- -----------------------------------------------------------------------------
-- Purpose:
--   The merchant prices THREE delivery zones, but only two of them had a
--   canonical column (`inside_dhaka_fee`, `outside_dhaka_fee`). The
--   "Sub-Dhaka / Dhaka Suburbs" rate — for areas that sit outside Dhaka city
--   but are still delivered by the Dhaka run (Kamrangirchar, Keraniganj,
--   Savar, Tongi, Demra, Uttarkhan, Southkhan, Rupganj, Narayanganj outskirts)
--   — lived only inside the `shipping_config` JSON blob, so a reader that did
--   not parse the blob quoted the wrong (inside-city) rate.
--
--   `sub_dhaka_fee` makes it first-class and queryable.
--
--   NULL semantics (identical to 0013, deliberate):
--     • NULL means "this zone was never priced" — NOT ৳0. The checkout then
--       falls back to the Inside-City fee, and if that is NULL too it renders
--       "To be confirmed" instead of a phantom ৳0.
--     • A stored 0 IS a deliberate "free delivery" and is honoured as ৳0.
--
-- Design rules (same as the rest of the chain):
--   - Idempotent: ADD COLUMN IF NOT EXISTS. Safe to run repeatedly.
--   - Existing data preserved: the new column starts NULL.
--   - Ends with NOTIFY pgrst so PostgREST re-introspects immediately.
-- =============================================================================

BEGIN;

ALTER TABLE IF EXISTS public.stores
  ADD COLUMN IF NOT EXISTS sub_dhaka_fee numeric,
  -- The merchant's OWN Sub-Dhaka area selection (JSON array of area keys,
  -- e.g. ["keraniganj","savar","tongi"]). See the header for the NULL vs
  -- empty-array semantics — nothing on the storefront is hardcoded from it.
  ADD COLUMN IF NOT EXISTS sub_dhaka_areas jsonb;

NOTIFY pgrst, 'reload schema';

COMMIT;
