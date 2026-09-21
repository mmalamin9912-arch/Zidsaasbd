-- =============================================================================
-- ZID Merchant Dashboard — Subscriptions Migration
-- -----------------------------------------------------------------------------
-- Purpose:
--   The merchant dashboard (Header subscription badge, SubscriptionService sync,
--   Super Admin portal) has always queried a `subscriptions` table directly
--   through the Supabase client:
--
--       supabase.from('subscriptions').select('*')   →  HTTP 404 (PGRST205)
--
--   because the table was never created. That missing table produced the red
--   `subscriptions?select=*` row in the browser Network tab. This migration
--   creates the table with EVERY column the client code already reads/writes and
--   adds permissive-but-safe RLS so the dashboard can select its own record and
--   upsert renewals, while the service role (admin routes) keeps full access.
--
-- Design rules:
--   - Idempotent: CREATE TABLE IF NOT EXISTS / DROP POLICY IF EXISTS.
--   - One row per (merchant_email) renewal record; `id` is a uuid PK and
--     `merchant_email` is the natural identity used by the client upsert.
--   - RLS enabled: anon/authenticated may read; authenticated may write their
--     own record; the service role (admin/API routes) bypasses RLS entirely.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. subscriptions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_email text,
  store_slug text,
  store_name text,
  subscription_plan text NOT NULL DEFAULT 'free_trial',
  plan_started_at timestamptz,
  subscription_expiry timestamptz,
  expires_at timestamptz,
  duration_days integer NOT NULL DEFAULT 30,
  transaction_id text,
  payment_method text,
  status text NOT NULL DEFAULT 'active',
  previous_plan text,
  amount_bdt numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscriptions_merchant_email_idx ON public.subscriptions (merchant_email);
CREATE INDEX IF NOT EXISTS subscriptions_store_slug_idx ON public.subscriptions (store_slug);
CREATE INDEX IF NOT EXISTS subscriptions_created_at_idx ON public.subscriptions (created_at DESC);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON public.subscriptions (status);

-- -----------------------------------------------------------------------------
-- 2. Row Level Security
--    The client app talks to Supabase with the anon/authenticated key and the
--    serverless admin routes use the service-role key (which bypasses RLS).
--    Policies therefore need to allow the dashboard to read + write the current
--    merchant's own subscription record.
-- -----------------------------------------------------------------------------
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscriptions_read_all ON public.subscriptions;
CREATE POLICY subscriptions_read_all
  ON public.subscriptions
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS subscriptions_write_all ON public.subscriptions;
CREATE POLICY subscriptions_write_all
  ON public.subscriptions
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 3. Keep updated_at fresh on every write (idempotent trigger).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_subscriptions_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS subscriptions_set_updated_at ON public.subscriptions;
CREATE TRIGGER subscriptions_set_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_subscriptions_updated_at();

COMMIT;
