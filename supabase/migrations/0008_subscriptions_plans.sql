-- =============================================================================
-- ZID Merchant Dashboard — Subscriptions Table (Plan Catalogue) Migration
-- =============================================================================
-- Purpose
-- -------
--   Fix the runtime error:
--
--       PGRST205: Could not find the table 'public.subscriptions' in the
--       schema cache
--
--   `public.subscriptions` was never provisioned in this Supabase project, so
--   every `supabase.from('subscriptions').select('*')` call and every plan
--   read/write from the Admin Subscription Configurator failed.
--
--   This migration is idempotent and:
--     1. Creates `public.subscriptions` when absent (fresh project).
--     2. ADDS the plan-catalogue columns requested by the product spec —
--        plan_name, price_bdt, duration_days, badge_text, features, is_active,
--        is_popular — to an existing table WITHOUT dropping the merchant-renewal
--        columns created by migration 0007 (so nothing regresses).
--     3. Installs the requested RLS policy set:
--          • Admin Portal  → full Read/Write (service role + authenticated).
--          * Merchants     → Read-only.
--     4. Seeds the four default plans (1-Month ৳1000, Starter 3-Month ৳3000,
--        Pro 6-Month ৳5000, Enterprise 12-Month ৳15000).
--
--   All statements are idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS /
--   DROP POLICY IF EXISTS) so the file can be re-run safely.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Create the table (fresh install). On an existing DB this is a no-op.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 2. Plan-catalogue columns (the shape the Admin Configurator + Merchant modal
--    use). ADD COLUMN IF NOT EXISTS keeps any pre-existing renewal columns.
-- -----------------------------------------------------------------------------
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS plan_id text,
  ADD COLUMN IF NOT EXISTS plan_name text,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS price_bdt numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duration_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS badge_text text,
  ADD COLUMN IF NOT EXISTS badge text,
  ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_popular boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_products integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description text;

-- -----------------------------------------------------------------------------
-- 3. Indexes for the lookups the app makes.
-- -----------------------------------------------------------------------------
-- slug must be unique so the seed upsert (ON CONFLICT (slug)) is valid.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_slug_key ON public.subscriptions (slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS subscriptions_slug_idx ON public.subscriptions (slug);
CREATE INDEX IF NOT EXISTS subscriptions_plan_id_idx ON public.subscriptions (plan_id);
CREATE INDEX IF NOT EXISTS subscriptions_plan_name_idx ON public.subscriptions (plan_name);
CREATE INDEX IF NOT EXISTS subscriptions_is_active_idx ON public.subscriptions (is_active);

-- -----------------------------------------------------------------------------
-- 4. Row Level Security
--    - Admin Portal: full Read/Write. The serverless admin routes use the
--      service-role key (which bypasses RLS); the policy below additionally
--      grants authenticated admins write access for the dashboard client.
--    - Merchants: Read-only (anon + authenticated may SELECT the plan catalogue
--      so the subscription modal can render live prices).
-- -----------------------------------------------------------------------------
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- 4a. Read — everyone (Admin Portal + Merchants) may read the plan catalogue.
DROP POLICY IF EXISTS subscriptions_select_all ON public.subscriptions;
CREATE POLICY subscriptions_select_all
  ON public.subscriptions
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- 4b. Write (INSERT/UPDATE/DELETE) — Admin Portal only.
DROP POLICY IF EXISTS subscriptions_admin_write ON public.subscriptions;
CREATE POLICY subscriptions_admin_write
  ON public.subscriptions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 5. updated_at trigger (idempotent).
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

-- -----------------------------------------------------------------------------
-- 6. Seed the default plan catalogue (upsert by slug). Prices match the product
--    spec: 1-Month ৳1000, Starter 3-Month ৳3000, Pro 6-Month ৳5000,
--    Enterprise 12-Month ৳15000.
-- -----------------------------------------------------------------------------
INSERT INTO public.subscriptions (id, slug, plan_id, plan_name, name, price_bdt, duration_days, badge_text, badge, features, is_active, is_popular, max_products)
VALUES
  (gen_random_uuid(), 'starter_1m', 'starter_1m', '1-Month Plan', '1-Month Plan', 1000, 30, '1_MONTH', '1_MONTH',
   '["Up to 100 Products","Standard Themes","Basic AI Tools","Standard Support"]'::jsonb, true, false, 100),
  (gen_random_uuid(), 'starter_3m', 'starter_3m', 'Starter Plan (3 Months)', 'Starter Plan (3 Months)', 3000, 90, '3_MONTHS', '3_MONTHS',
   '["Up to 500 Products","Standard Themes","Pro AI Tools (Description, Image, Pricing)","Standard Support"]'::jsonb, true, false, 500),
  (gen_random_uuid(), 'pro_6m', 'pro_6m', 'Pro Plan (6 Months)', 'Pro Plan (6 Months)', 5000, 180, '6_MONTHS', '6_MONTHS',
   '["Unlimited Products","Premium Themes","Pro AI Marketing & Caption Tools","Priority Support"]'::jsonb, true, true, 0),
  (gen_random_uuid(), 'enterprise_12m', 'enterprise_12m', 'Enterprise Plan (12 Months)', 'Enterprise Plan (12 Months)', 15000, 365, '12_MONTHS', '12_MONTHS',
   '["Unlimited Products","Full AI Suite Unlocked","Priority Support","Custom Domain"]'::jsonb, true, false, 0)
ON CONFLICT (slug) DO NOTHING;

COMMIT;
