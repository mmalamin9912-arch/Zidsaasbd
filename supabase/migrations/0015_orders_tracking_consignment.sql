-- =============================================================================
-- ZID Merchant Dashboard — Add consignment_id and tracking_code to orders
-- -----------------------------------------------------------------------------
-- Purpose:
--   Support automated courier webhooks and status synchronization (e.g. Pathao)
--   by tracking the courier consignment ID and tracking code on the orders table.
--
-- Design rules:
--   - Idempotent: ADD COLUMN IF NOT EXISTS. Safe to run repeatedly.
--   - Ends with NOTIFY pgrst so PostgREST re-introspects immediately.
-- =============================================================================

BEGIN;

ALTER TABLE IF EXISTS public.orders
  ADD COLUMN IF NOT EXISTS consignment_id text,
  ADD COLUMN IF NOT EXISTS tracking_code  text;

CREATE INDEX IF NOT EXISTS orders_consignment_id_idx ON public.orders (consignment_id);
CREATE INDEX IF NOT EXISTS orders_tracking_code_idx ON public.orders (tracking_code);

NOTIFY pgrst, 'reload schema';

COMMIT;
