-- =============================================================================
-- ZID Merchant Dashboard — Row Level Security lockdown
-- Migration: 0016_enable_rls_all_tables.sql
-- =============================================================================
-- This migration simply enables RLS on every table in `public` and removes
-- any client-facing policies. No column is referenced by name, so the script
-- cannot fail on a missing `is_published`, `is_active`, `store_slug`,
-- `user_id` / `auth_user_id` / `owner_id`, or similar column.
--
-- With RLS enabled and NO policy, client roles (anon / authenticated) are
-- denied all access. The service-role key used by the API bypasses RLS, so
-- every /api route keeps working unchanged.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. DROP EXISTING CLIENT POLICIES (clean slate).
--    DROP POLICY IF EXISTS is a no-op when the policy/table does not exist.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS products_select_public ON public.products;
DROP POLICY IF EXISTS products_write_owner ON public.products;
DROP POLICY IF EXISTS categories_select_public ON public.categories;
DROP POLICY IF EXISTS categories_write_owner ON public.categories;
DROP POLICY IF EXISTS stores_select_owner ON public.stores;
DROP POLICY IF EXISTS stores_update_owner ON public.stores;
DROP POLICY IF EXISTS platform_config_public_read ON public.platform_config;

-- -----------------------------------------------------------------------------
-- 2. ENABLE RLS ON EVERY TABLE IN `public`.
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

-- -----------------------------------------------------------------------------
-- 3. REMOVE DYNAMIC OWNERSHIP HELPERS.
--    zid_store_owner_column(), zid_owns_store_slug(), zid_owns_store()
--    inspected pg_attribute for ownership columns and were referenced by
--    static policies. They are no longer needed; RLS with no policy =
--    deny-all, which is the safe default.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.zid_store_owner_column();
DROP FUNCTION IF EXISTS public.zid_owns_store_slug(text);
DROP FUNCTION IF EXISTS public.zid_owns_store(uuid);

COMMIT;

-- =============================================================================
-- POST-DEPLOY VERIFICATION (run manually after the migration):
-- =============================================================================
-- 1. Every table must have RLS on (expect zero rows):
--      SELECT tablename FROM pg_tables
--      WHERE schemaname='public' AND rowsecurity = false;
--
-- 2. As anon, every table must be unreadable (expect an error or zero rows):
--      SET ROLE anon;
--      SELECT * FROM public.orders LIMIT 1;
--      RESET ROLE;
-- =============================================================================