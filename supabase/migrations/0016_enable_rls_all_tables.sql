-- =============================================================================
-- ZID Merchant Dashboard — Row Level Security lockdown
-- Migration: 0016_enable_rls_all_tables.sql
-- =============================================================================
-- This migration ONLY does two things:
--   1. Drops the client-facing policies created by earlier migrations.
--   2. Enables RLS on every table in `public`.
--
-- It contains NO policy expressions and NO column-name checks, and it calls no
-- helper functions that inspect pg_attribute. Nothing here references
-- `is_published`, `is_active`, `store_slug`, `user_id` / `auth_user_id` /
-- `owner_id` / `created_by`, or any other column, so the script cannot fail with
-- `column "..." does not exist` on schemas that lack those columns.
--
-- With RLS enabled and NO policy, client roles (anon / authenticated) are
-- denied all access. The service-role key used by the API bypasses RLS, so
-- every /api route keeps working unchanged.
--
-- Every statement is guarded (IF EXISTS) so the migration is idempotent and
-- safe to re-run against a schema that differs from the one it was written on.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. DROP EXISTING CLIENT POLICIES (clean slate).
--    Policies inherited from earlier migrations — all of these contained column
--    references (is_published / is_active / owner columns), so they are removed
--    here rather than re-created.
--    DROP POLICY IF EXISTS is a no-op when the policy/table does not exist.
-- -----------------------------------------------------------------------------
-- Orders (0001_orders_store_rls.sql)
DROP POLICY IF EXISTS orders_insert_store_exists ON public.orders;
DROP POLICY IF EXISTS orders_select_owner        ON public.orders;
DROP POLICY IF EXISTS orders_update_owner        ON public.orders;
DROP POLICY IF EXISTS orders_delete_owner        ON public.orders;
DROP POLICY IF EXISTS orders_public_insert       ON public.orders;

-- Catalog / public read policies
DROP POLICY IF EXISTS products_select_public       ON public.products;
DROP POLICY IF EXISTS products_write_owner         ON public.products;
DROP POLICY IF EXISTS categories_select_public     ON public.categories;
DROP POLICY IF EXISTS categories_write_owner       ON public.categories;
DROP POLICY IF EXISTS stores_select_owner          ON public.stores;
DROP POLICY IF EXISTS stores_update_owner          ON public.stores;
DROP POLICY IF EXISTS platform_config_public_read  ON public.platform_config;

-- Admin portal catalog (0003_admin_portal_catalog.sql) — referenced
-- is_published / is_active / status.
DROP POLICY IF EXISTS subscription_plans_read_published  ON public.subscription_plans;
DROP POLICY IF EXISTS subscription_plans_admin_all       ON public.subscription_plans;
DROP POLICY IF EXISTS themes_templates_read_published    ON public.themes_templates;
DROP POLICY IF EXISTS themes_templates_admin_all         ON public.themes_templates;
DROP POLICY IF EXISTS platform_addons_read_published     ON public.platform_addons;
DROP POLICY IF EXISTS platform_addons_admin_all          ON public.platform_addons;

-- -----------------------------------------------------------------------------
-- 2. ENABLE RLS ON EVERY TABLE IN `public`.
--    Tables created by earlier migrations plus the core storefront tables.
--    ALTER TABLE IF EXISTS is a no-op when the table does not exist.
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.orders             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stores             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.products           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.categories         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.platform_config    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.whatsapp_otps      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.admin_team         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.role_permissions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.security_settings  ENABLE ROW LEVEL SECURITY;
-- 0003_admin_portal_catalog.sql
ALTER TABLE IF EXISTS public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.themes_templates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.platform_addons    ENABLE ROW LEVEL SECURITY;
-- 0005_support_comms.sql
ALTER TABLE IF EXISTS public.support_tickets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.broadcast_history  ENABLE ROW LEVEL SECURITY;
-- 0007 / 0008 / 0010 — subscriptions
ALTER TABLE IF EXISTS public.subscriptions      ENABLE ROW LEVEL SECURITY;
-- 0009_notifications.sql
ALTER TABLE IF EXISTS public.notifications      ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 3. REMOVE DYNAMIC OWNERSHIP HELPERS.
--    zid_store_owner_column(), zid_owns_store_slug(), zid_owns_store() and
--    zid_resolve_store_id() inspected pg_attribute / columns at runtime and
--    were referenced by static policies. They are no longer needed:
--    RLS with no policy = deny-all, which is the safe default.
--    DROP FUNCTION IF EXISTS does not resolve the argument types against the
--    schema catalog, so a missing column can never break this statement.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.zid_store_owner_column();
DROP FUNCTION IF EXISTS public.zid_owns_store_slug(text);
DROP FUNCTION IF EXISTS public.zid_owns_store(uuid);
DROP FUNCTION IF EXISTS public.zid_resolve_store_id(text);

COMMIT;

-- =============================================================================
-- POST-DEPLOY VERIFICATION (run manually after the migration):
-- =============================================================================
-- 1. Every table must have RLS on (expect zero rows):
--      SELECT tablename FROM pg_tables
--      WHERE schemaname='public' AND rowsecurity = false;
--
-- 2. No client policies should remain (expect zero rows):
--      SELECT schemaname, tablename, policyname FROM pg_policies
--      WHERE schemaname='public';
--
-- 3. As anon, every table must be unreadable (expect an error or zero rows):
--      SET ROLE anon;
--      SELECT * FROM public.orders LIMIT 1;
--      RESET ROLE;
-- =============================================================================
