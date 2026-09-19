-- =============================================================================
-- ZID Merchant Dashboard — Super Admin Portal Catalog Migration
-- -----------------------------------------------------------------------------
-- Purpose:
--   Create the three Supabase tables backing the Super Admin Portal's
--   configuration surfaces:
--     1. subscription_plans — plan catalogue (price, duration, features, limits)
--     2. themes_templates   — store themes/templates available to merchants
--     3. platform_addons   — platform add-ons/extensions for merchants
--
-- All three are written by the Super Admin (service role) and read by the
-- admin dashboard. They are the Supabase-side mirror of the existing MongoDB
-- collections (`subscription_plans`, `themes`/`theme_requests`,
-- `platform_addons`); the hybrid data layer (lib/hybridDb.ts) prefers
-- MongoDB and falls back to these tables when Mongo is empty or unavailable.
--
-- Design rules:
--   - Every table has an `id` UUID primary key (canonical Supabase identity)
--     plus a human-stable `slug`/`code` for cross-provider merging.
--   - RLS is enabled but the admin routes hit Supabase with the SERVICE ROLE
--     key (bypassing RLS), so policies here are permissive for authenticated
--     admins and restrictive for everyone else.
--   - `is_published`/`is_active` flags control visibility to merchants.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. subscription_plans
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text,
  code text,
  name text NOT NULL,
  title text,
  label text,
  price_bdt numeric(12,2) NOT NULL DEFAULT 0,
  price numeric(12,2) NOT NULL DEFAULT 0,
  amount_bdt numeric(12,2) NOT NULL DEFAULT 0,
  duration_days integer NOT NULL DEFAULT 30,
  duration integer,
  days integer,
  max_products integer NOT NULL DEFAULT 0,
  product_limit integer,
  max_orders integer,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  is_published boolean NOT NULL DEFAULT true,
  enabled boolean,
  "default" boolean NOT NULL DEFAULT false,
  is_popular boolean NOT NULL DEFAULT false,
  badge text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscription_plans_slug_idx ON public.subscription_plans (slug);
CREATE INDEX IF NOT EXISTS subscription_plans_code_idx ON public.subscription_plans (code);
CREATE INDEX IF NOT EXISTS subscription_plans_active_idx ON public.subscription_plans (is_active);
CREATE INDEX IF NOT EXISTS subscription_plans_updated_idx ON public.subscription_plans (updated_at DESC);

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscription_plans_read_published ON public.subscription_plans;
CREATE POLICY subscription_plans_read_published
  ON public.subscription_plans
  FOR SELECT
  TO anon, authenticated
  USING (is_published = true OR is_active = true);

DROP POLICY IF EXISTS subscription_plans_admin_all ON public.subscription_plans;
CREATE POLICY subscription_plans_admin_all
  ON public.subscription_plans
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- -----------------------------------------------------------------------------
-- 2. themes_templates
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.themes_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text,
  name text NOT NULL,
  category text,
  price_bdt numeric(12,2) NOT NULL DEFAULT 0,
  price numeric(12,2) NOT NULL DEFAULT 0,
  is_free boolean NOT NULL DEFAULT false,
  preview_url text,
  thumbnail_url text,
  previewUrl text,
  thumbnailUrl text,
  status text NOT NULL DEFAULT 'Active',
  is_published boolean NOT NULL DEFAULT true,
  "default" boolean NOT NULL DEFAULT false,
  template_style text,
  template text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS themes_templates_slug_idx ON public.themes_templates (slug);
CREATE INDEX IF NOT EXISTS themes_templates_status_idx ON public.themes_templates (status);
CREATE INDEX IF NOT EXISTS themes_templates_updated_idx ON public.themes_templates (updated_at DESC);

ALTER TABLE public.themes_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS themes_templates_read_published ON public.themes_templates;
CREATE POLICY themes_templates_read_published
  ON public.themes_templates
  FOR SELECT
  TO anon, authenticated
  USING (is_published = true OR status = 'Active');

DROP POLICY IF EXISTS themes_templates_admin_all ON public.themes_templates;
CREATE POLICY themes_templates_admin_all
  ON public.themes_templates
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- -----------------------------------------------------------------------------
-- 3. platform_addons
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text,
  name text NOT NULL,
  category text,
  pricing_type text NOT NULL DEFAULT 'Free',
  price_bdt numeric(12,2) NOT NULL DEFAULT 0,
  price numeric(12,2) NOT NULL DEFAULT 0,
  description text,
  icon text,
  is_published boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_addons_slug_idx ON public.platform_addons (slug);
CREATE INDEX IF NOT EXISTS platform_addons_category_idx ON public.platform_addons (category);
CREATE INDEX IF NOT EXISTS platform_addons_published_idx ON public.platform_addons (is_published);
CREATE INDEX IF NOT EXISTS platform_addons_updated_idx ON public.platform_addons (updated_at DESC);

ALTER TABLE public.platform_addons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_addons_read_published ON public.platform_addons;
CREATE POLICY platform_addons_read_published
  ON public.platform_addons
  FOR SELECT
  TO anon, authenticated
  USING (is_published = true OR is_active = true);

DROP POLICY IF EXISTS platform_addons_admin_all ON public.platform_addons;
CREATE POLICY platform_addons_admin_all
  ON public.platform_addons
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- -----------------------------------------------------------------------------
-- 4. updated_at auto-trigger (shared helper)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_subscription_plans_updated ON public.subscription_plans;
CREATE TRIGGER trg_subscription_plans_updated
  BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_themes_templates_updated ON public.themes_templates;
CREATE TRIGGER trg_themes_templates_updated
  BEFORE UPDATE ON public.themes_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_platform_addons_updated ON public.platform_addons;
CREATE TRIGGER trg_platform_addons_updated
  BEFORE UPDATE ON public.platform_addons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;