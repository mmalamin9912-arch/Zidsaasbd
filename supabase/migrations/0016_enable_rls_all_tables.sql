-- =============================================================================
-- ZID Merchant Dashboard — Full Row Level Security lockdown
-- Migration: 0016_enable_rls_all_tables.sql
-- -----------------------------------------------------------------------------
-- WHY
--   Supabase reported the project "Zid-BD-Merchant" had publicly accessible
--   tables because RLS was disabled. Without RLS, ANY holder of the public anon
--   key (= every visitor, it ships in the JS bundle) can read and write the
--   entire schema through PostgREST:
--
--       curl "$SUPABASE_URL/rest/v1/orders?select=*" -H "apikey: <anon>"
--
--   That is a full data breach: every merchant's orders, customer phone
--   numbers, and the whatsapp_otps table (live login codes).
--
-- DESIGN — READ THIS BEFORE CHANGING A POLICY
--   1. RLS is ENABLED on every table in `public`. A table with RLS enabled and
--      NO policy is DENIED to anon/authenticated — the safe default.
--   2. Two classes of table:
--        * SERVER-ONLY  — written exclusively by the Express API with the
--          service-role key (which BYPASSES RLS). Enabling RLS here costs
--          nothing and closes the public hole.
--        * CLIENT-WRITTEN — the browser writes these directly with the anon
--          key, so they need real policies (see section 3).
--   3. Ownership is always resolved through `stores`:
--          stores.user_id / stores.auth_user_id / stores.owner_id = auth.uid()
--      Nothing here trusts a client-supplied merchant id.
--   4. The public storefront must still work for signed-out shoppers:
--        - read published products/categories of ACTIVE stores
--        - create an order for an existing store
--        - NOT read anyone else's orders
--
-- ROLLBACK: each table has a documented `DISABLE ROW LEVEL SECURITY` at the end.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Helper functions (SECURITY DEFINER so they can read `stores` from inside a
--    policy without recursing into the stores policy itself).
-- -----------------------------------------------------------------------------

-- Stores owned by the caller.
CREATE OR REPLACE FUNCTION public.zid_my_store_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id
  FROM public.stores s
  WHERE auth.uid() IS NOT NULL
    AND s.id IS NOT NULL
    AND (
          s.user_id      = auth.uid()
       OR s.auth_user_id = auth.uid()
       OR s.owner_id     = auth.uid()
    );
$$;

-- True when the caller owns the store referenced by a row's store column.
CREATE OR REPLACE FUNCTION public.zid_owns_store(target_store uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.zid_my_store_ids() AS owned(id)
    WHERE owned.id = target_store
  );
$$;

-- True when the caller owns the store addressed by SLUG (several write paths
-- carry the slug rather than the UUID).
CREATE OR REPLACE FUNCTION public.zid_owns_store_slug(target_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.stores s
    WHERE auth.uid() IS NOT NULL
      AND lower(trim(s.store_slug)) = lower(trim(coalesce(target_slug, '')))
      AND (
            s.user_id      = auth.uid()
         OR s.auth_user_id = auth.uid()
         OR s.owner_id     = auth.uid()
      )
  );
$$;

REVOKE ALL ON FUNCTION public.zid_my_store_ids()        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.zid_owns_store(uuid)      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.zid_owns_store_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zid_my_store_ids()        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.zid_owns_store(uuid)      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.zid_owns_store_slug(text) TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 1. ENABLE RLS ON EVERY TABLE IN `public`.
--    Done dynamically so a table added by a later migration is not silently
--    left wide open.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'          -- ordinary tables only (not views)
      AND NOT c.relrowsecurity     -- skip ones already enabled
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t.relname);
    RAISE NOTICE 'RLS enabled on public.%', t.relname;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 2. SERVER-ONLY TABLES.
--
--    These are written by the Express API using the service-role key, which
--    bypasses RLS, so enabling RLS (done above) already closes the public hole.
--    This section ADDS owner-read policies where it is genuinely useful, and
--    deliberately adds NOTHING (=> deny-all) where exposure would be harmful.
--
--    DENY-ALL (no policy at all, intentionally):
--        whatsapp_otps      live login codes — never readable by a client
--        security_settings  platform policy
--        admin_*            admin identity/roles
--        *_ledger / payouts financial ledger rows
-- -----------------------------------------------------------------------------

/*
 * DROP THE LEGACY "EVERYONE CAN DO EVERYTHING" POLICIES.
 *
 * Migrations 0004/0006 created `FOR ALL TO authenticated, anon USING (true)
 * WITH CHECK (true)` on platform_config, security_settings, audit_logs,
 * admin_team and role_permissions. Those policies are worse than having no RLS:
 * they let ANY anonymous visitor rewrite the platform payment gateway numbers
 * (so shoppers would send money to the attacker's bKash) and read the full
 * admin team, security policy and audit trail.
 *
 * The API writes these tables with the service-role key (which bypasses RLS),
 * so removing the client policies changes nothing functionally.
 */
DO $$
DECLARE
  stale record;
BEGIN
  FOR stale IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'platform_config', 'security_settings', 'audit_logs',
        'admin_team', 'role_permissions', 'whatsapp_otps'
      )
      -- Only the blanket policies, matched by their known names.
      AND policyname IN (
        'platform_config_admin_all', 'security_settings_admin_all',
        'audit_logs_admin_all', 'admin_team_admin_all',
        'role_permissions_admin_all', 'whatsapp_otps_all'
      )
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', stale.policyname, stale.schemaname, stale.tablename);
    RAISE NOTICE 'Dropped permissive policy %.%.%', stale.schemaname, stale.tablename, stale.policyname;
  END LOOP;
END $$;

-- Platform configuration: PUBLIC READ is required (the storefront renders the
-- gateway numbers and support contacts). Writes stay server-only.
--
-- NOTE ON SENSITIVITY: this table also holds `adminPaymentConfig` (the platform
-- wallet numbers shown to shoppers) and courier/template settings. If any
-- SECRET is ever added here, move it to a separate table — this policy is
-- readable by every visitor, which is the point of it.
ALTER TABLE IF EXISTS public.platform_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_config_public_read ON public.platform_config;
CREATE POLICY platform_config_public_read
  ON public.platform_config FOR SELECT
  TO anon, authenticated
  USING (true);

-- audit_logs: admin-only. The API writes them; no client needs to read them via
-- PostgREST (the dashboard reads /api/admin/audit-logs, which is server-side).
ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY;

-- admin_team / role_permissions: deny-all to clients.
ALTER TABLE IF EXISTS public.admin_team       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.role_permissions ENABLE ROW LEVEL SECURITY;

-- whatsapp_otps: no policy => no client access whatsoever.
ALTER TABLE IF EXISTS public.whatsapp_otps ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 3. STORES
--    Owner: full access to their own row.
--    Public: may read the minimal public storefront projection (a store page
--    must render for a signed-out visitor). This is limited to ACTIVE stores.
-- -----------------------------------------------------------------------------
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stores_select_owner ON public.stores;
CREATE POLICY stores_select_owner
  ON public.stores FOR SELECT
  TO authenticated
  USING (
        user_id      = auth.uid()
     OR auth_user_id = auth.uid()
     OR owner_id     = auth.uid()
  );

DROP POLICY IF EXISTS stores_select_public ON public.stores;
CREATE POLICY stores_select_public
  ON public.stores FOR SELECT
  TO anon, authenticated
  USING (coalesce(is_active, true) = true);

DROP POLICY IF EXISTS stores_update_owner ON public.stores;
CREATE POLICY stores_update_owner
  ON public.stores FOR UPDATE
  TO authenticated
  USING (
        user_id      = auth.uid()
     OR auth_user_id = auth.uid()
     OR owner_id     = auth.uid()
  )
  WITH CHECK (
        user_id      = auth.uid()
     OR auth_user_id = auth.uid()
     OR owner_id     = auth.uid()
  );

-- Self-service signup creates a store row for the caller; the row must be
-- owned by them from the first write or no later policy could ever match.
DROP POLICY IF EXISTS stores_insert_self ON public.stores;
CREATE POLICY stores_insert_self
  ON public.stores FOR INSERT
  TO authenticated
  WITH CHECK (
        user_id      = auth.uid()
     OR auth_user_id = auth.uid()
     OR owner_id     = auth.uid()
  );

-- -----------------------------------------------------------------------------
-- 4. PRODUCTS
--    Public read = published, non-archived items of an ACTIVE store.
--    (The storefront MUST show products to signed-out shoppers — a deny-all
--     here would empty every catalogue.)
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_select_public ON public.products;
CREATE POLICY products_select_public
  ON public.products FOR SELECT
  TO anon, authenticated
  USING (
    coalesce(is_published, true) = true
    AND lower(coalesce(status, 'active')) NOT IN ('archived', 'hidden', 'draft')
  );

DROP POLICY IF EXISTS products_write_owner ON public.products;
CREATE POLICY products_write_owner
  ON public.products FOR ALL
  TO authenticated
  USING     (public.zid_owns_store_slug(store_slug))
  WITH CHECK (public.zid_owns_store_slug(store_slug));

-- -----------------------------------------------------------------------------
-- 5. CATEGORIES — same shape as products.
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS categories_select_public ON public.categories;
CREATE POLICY categories_select_public
  ON public.categories FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE lower(trim(s.store_slug)) = lower(trim(categories.store_slug))
        AND coalesce(s.is_active, true) = true
    )
  );

DROP POLICY IF EXISTS categories_write_owner ON public.categories;
CREATE POLICY categories_write_owner
  ON public.categories FOR ALL
  TO authenticated
  USING     (public.zid_owns_store_slug(store_slug))
  WITH CHECK (public.zid_owns_store_slug(store_slug));

-- -----------------------------------------------------------------------------
-- 6. ORDERS + ORDER ITEMS — NO CLIENT ACCESS WHATSOEVER.
--
--    The checkout used to INSERT into `orders` from the browser (anon key),
--    which is why the table needed a write policy and a public read policy. The
--    browser no longer touches Supabase for order data at all:
--
--      WRITE  POST /api/orders        (service role — bypasses RLS)
--      READ   GET  /api/orders        (MongoDB, merchant + admin dashboards)
--             GET  /api/customer/supabase-orders (service role + signed session)
--
--    Because the service role BYPASSES RLS, enabling RLS here and adding NO
--    policy blocks every anon/authenticated path while leaving the API routes
--    completely unaffected. That is the strongest posture available: not even
--    the customer's own rows are reachable with the public anon key.
-- -----------------------------------------------------------------------------
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Drop every legacy client policy on this table (from earlier migrations and
-- from ORDER_ITEMS_MIGRATION_SQL, which is still shipped to old clients).
DROP POLICY IF EXISTS orders_select_owner              ON public.orders;
DROP POLICY IF EXISTS orders_update_owner              ON public.orders;
DROP POLICY IF EXISTS orders_delete_owner              ON public.orders;
DROP POLICY IF EXISTS orders_insert_store_exists       ON public.orders;
DROP POLICY IF EXISTS orders_select_public_tracking    ON public.orders;
DROP POLICY IF EXISTS orders_insert_anon               ON public.orders;
DROP POLICY IF EXISTS orders_select_anon               ON public.orders;

-- 6b. `order_items` — same story: written by the server, read by nobody.
ALTER TABLE IF EXISTS public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_items_select_owner         ON public.order_items;
DROP POLICY IF EXISTS order_items_insert_store_exists  ON public.order_items;
DROP POLICY IF EXISTS order_items_insert_anon          ON public.order_items;
DROP POLICY IF EXISTS order_items_select_anon          ON public.order_items;

-- -----------------------------------------------------------------------------
-- 7. SUBSCRIPTIONS / PLAN CATALOGUE
--    Plans are public marketing data; a merchant's subscription is private.
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscription_plans_public_read ON public.subscription_plans;
CREATE POLICY subscription_plans_public_read
  ON public.subscription_plans FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS plans_public_read ON public.plans;
CREATE POLICY plans_public_read
  ON public.plans FOR SELECT
  TO anon, authenticated
  USING (true);

ALTER TABLE IF EXISTS public.subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscriptions_owner_all ON public.subscriptions;
CREATE POLICY subscriptions_owner_all
  ON public.subscriptions FOR ALL
  TO authenticated
  USING (public.zid_owns_store_slug(store_slug))
  WITH CHECK (public.zid_owns_store_slug(store_slug));

-- Pending purchase requests are submitted by a merchant and reviewed by an
-- admin (server-side, service role).
ALTER TABLE IF EXISTS public.subscription_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscription_requests_owner ON public.subscription_requests;
CREATE POLICY subscription_requests_owner
  ON public.subscription_requests FOR ALL
  TO authenticated
  USING (public.zid_owns_store_slug(store_slug))
  WITH CHECK (public.zid_owns_store_slug(store_slug));

-- -----------------------------------------------------------------------------
-- 8. REMAINING PUBLIC-SCHEMA TABLES
--
--    Everything not named above gets RLS (already applied in section 1) and NO
--    policy. That is deny-all to anon/authenticated and is the correct default
--    for tables the SERVER owns. The API continues to work because it uses the
--    service-role key, which bypasses RLS.
--
--    Verify this assumption after applying:
--        SELECT tablename FROM pg_tables
--        WHERE schemaname='public' AND rowsecurity = false;
--    It must return zero rows.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 9. Documented rollback (do NOT run unless you are deliberately removing RLS)
-- -----------------------------------------------------------------------------
-- ALTER TABLE public.stores      DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.orders      DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.order_items DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.products    DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.categories  DISABLE ROW LEVEL SECURITY;

COMMIT;

-- =============================================================================
-- POST-DEPLOY VERIFICATION (run in the SQL editor)
-- =============================================================================
-- 1. Every public table must have RLS on:
--      SELECT tablename, rowsecurity FROM pg_tables
--      WHERE schemaname = 'public' ORDER BY rowsecurity, tablename;
--
-- 2. As the ANON role, orders must NOT be readable (expect 0 rows / 401):
--      SET ROLE anon;
--      SELECT * FROM public.orders LIMIT 1;
--      RESET ROLE;
--
-- 3. As ANON, published products must still be readable (storefront intact):
--      SET ROLE anon;
--      SELECT count(*) FROM public.products;
--      RESET ROLE;
-- =============================================================================
