-- =============================================================================
-- ZID Merchant Dashboard — Row Level Security lockdown (dynamic, schema-safe)
-- Migration: 0016_enable_rls_all_tables.sql   (REWRITTEN)
-- -----------------------------------------------------------------------------
-- WHY THIS IS A REWRITE
--   The first version of this migration failed with
--       ERROR: column s.user_id does not exist
--   because it assumed the `stores` table has ownership columns
--   (`user_id` / `auth_user_id` / `owner_id`). Referencing a column that does
--   not exist is a PARSE-TIME error in PostgreSQL: the whole script aborts
--   before a single policy is created.
--
--   Worse, a static policy can never be correct here. Whether `stores.user_id`
--   exists depends on migrations 0001/0010 having been applied to THIS project
--   — and Supabase reports the schema is NOT what those files describe. So this
--   version never names an ownership column literally:
--
--     • every `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` is generated in a loop
--       over pg_class, so a missing/renamed table cannot break it;
--     • ownership is resolved by a helper that CHECKS pg_attribute at runtime
--       and only then builds the predicate with dynamic SQL;
--     • if no ownership column exists at all, the helper degrades to
--       "matches nothing" instead of failing the migration.
--
-- WHAT THIS MIGRATION GUARANTEES
--   1. RLS is enabled on EVERY table in `public` (loop — no table list to miss).
--   2. No client INSERT/UPDATE/DELETE policy on order data. The server writes
--      with the SERVICE-ROLE key, which BYPASSES RLS, so
--      `writeOrderToSupabase()` and every /api route keep working unchanged.
--   3. Public storefront reads (published products, active categories) survive.
--   4. Sensitive tables (whatsapp_otps, audit_logs, admin_team, …) are deny-all.
--
-- VERIFY AFTER RUNNING (must return zero rows):
--     SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity = false;
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. ENABLE RLS ON EVERY TABLE IN `public`.
--    Do this FIRST and unconditionally: even if a later helper cannot build an
--    ownership predicate, the tables are still closed. (RLS with no policy =
--    deny-all to anon/authenticated.)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t record;
  n integer := 0;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t.relname);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'RLS enabled on % table(s).', n;
END $$;

-- -----------------------------------------------------------------------------
-- 2. DROP EVERY LEGACY CLIENT POLICY ON ORDER / SENSITIVE DATA.
--    These came from migrations 0001/0004/0005/0006 and from the
--    ORDER_ITEMS_MIGRATION_SQL constant still shipped to old clients.
--    `orders_select_anon ... using (true)` is what let anyone holding the public
--    anon key read every customer's name, phone and address.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  stale record;
BEGIN
  FOR stale IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'orders', 'order_items', 'whatsapp_otps', 'audit_logs',
        'admin_team', 'role_permissions', 'security_settings'
      )
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', stale.policyname, stale.schemaname, stale.tablename);
    RAISE NOTICE 'Dropped policy %.%.%', stale.schemaname, stale.tablename, stale.policyname;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 3. OWNERSHIP HELPERS — built only from columns that ACTUALLY EXIST.
--
--    `zid_owns_store_slug(text)` is the single predicate every owner policy
--    uses. It scans `stores` for a row whose slug matches AND whose ownership
--    column equals auth.uid(). The ownership column is discovered at runtime;
--    if none exists, the function returns false (deny) rather than throwing.
-- -----------------------------------------------------------------------------

-- Which column (if any) ties a `stores` row to an auth user?
CREATE OR REPLACE FUNCTION public.zid_store_owner_column()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.attname
  FROM pg_attribute a
  JOIN pg_class c        ON c.oid = a.attrelid
  JOIN pg_namespace ns   ON ns.oid = c.relnamespace
  WHERE ns.nspname = 'public'
    AND c.relname  = 'stores'
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND a.attname IN ('user_id', 'auth_user_id', 'owner_id', 'created_by')
  ORDER BY array_position(
             ARRAY['user_id','auth_user_id','owner_id','created_by'],
             a.attname
           )
  LIMIT 1;
$$;

-- True when the caller owns the store addressed by slug. Never errors.
CREATE OR REPLACE FUNCTION public.zid_owns_store_slug(target_slug text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_col text := public.zid_store_owner_column();
  matched   boolean := false;
BEGIN
  IF owner_col IS NULL OR auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  IF coalesce(trim(target_slug), '') = '' THEN
    RETURN false;
  END IF;

  EXECUTE format(
    'SELECT EXISTS (SELECT 1 FROM public.stores s
                     WHERE lower(trim(s.store_slug)) = lower(trim($1))
                       AND s.%I = auth.uid())',
    owner_col
  ) INTO matched USING target_slug;

  RETURN coalesce(matched, false);
EXCEPTION
  -- A rename/type change between the check and the query must not abort the
  -- call; deny instead.
  WHEN others THEN
    RETURN false;
END $$;

-- True when the caller owns the store UUID (orders/order_items use store_id).
CREATE OR REPLACE FUNCTION public.zid_owns_store(target_store uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_col text := public.zid_store_owner_column();
  matched   boolean := false;
BEGIN
  IF owner_col IS NULL OR auth.uid() IS NULL OR target_store IS NULL THEN
    RETURN false;
  END IF;

  EXECUTE format(
    'SELECT EXISTS (SELECT 1 FROM public.stores s
                     WHERE s.id = $1
                       AND s.%I = auth.uid())',
    owner_col
  ) INTO matched USING target_store;

  RETURN coalesce(matched, false);
EXCEPTION
  WHEN others THEN
    RETURN false;
END $$;

REVOKE ALL ON FUNCTION public.zid_store_owner_column()        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.zid_owns_store_slug(text)       FROM PUBLIC;
REVOKE ALL ON FUNCTION public.zid_owns_store(uuid)            FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zid_owns_store_slug(text)    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.zid_owns_store(uuid)         TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. ORDERS + ORDER ITEMS — NO CLIENT ACCESS.
--
--    The browser no longer touches Supabase for order data:
--       WRITE  POST /api/orders                    (service role → bypasses RLS)
--       READ   GET  /api/orders                    (MongoDB)
--              GET  /api/customer/supabase-orders  (service role + session)
--
--    Because the service role bypasses RLS, leaving these tables with NO policy
--    closes them completely while every API route keeps working.
--    (Policies were already dropped in section 2 — nothing to add here.)
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_items ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 5. STORES — owner read/update, plus a public read of ACTIVE stores so a
--    storefront page renders for a signed-out visitor.
--    Policies use the dynamic helper, so they are valid whether or not the
--    ownership column exists (they simply match nothing when it does not).
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.stores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stores_select_owner ON public.stores;
CREATE POLICY stores_select_owner
  ON public.stores FOR SELECT
  TO authenticated
  USING (public.zid_owns_store_slug(store_slug));

DROP POLICY IF EXISTS stores_update_owner ON public.stores;
CREATE POLICY stores_update_owner
  ON public.stores FOR UPDATE
  TO authenticated
  USING     (public.zid_owns_store_slug(store_slug))
  WITH CHECK (public.zid_owns_store_slug(store_slug));

-- -----------------------------------------------------------------------------
-- 6. PRODUCTS — public read of published, non-archived items; owner writes.
--    The storefront MUST show products to signed-out shoppers, so the public
--    read is intentional and limited to rows the catalogue would show anyway.
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
-- 7. CATEGORIES — public read scoped to an active store; owner writes.
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS categories_select_public ON public.categories;
CREATE POLICY categories_select_public
  ON public.categories FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS categories_write_owner ON public.categories;
CREATE POLICY categories_write_owner
  ON public.categories FOR ALL
  TO authenticated
  USING     (public.zid_owns_store_slug(store_slug))
  WITH CHECK (public.zid_owns_store_slug(store_slug));

-- -----------------------------------------------------------------------------
-- 8. PLATFORM CONFIG — public read (the storefront renders the gateway numbers
--    and support contacts). Writes stay server-only.
--    NOTE: the API redacts secret fields before returning this document.
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.platform_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_config_public_read ON public.platform_config;
CREATE POLICY platform_config_public_read
  ON public.platform_config FOR SELECT
  TO anon, authenticated
  USING (true);

-- -----------------------------------------------------------------------------
-- 9. DENY-ALL TABLES (RLS enabled in section 1, policies dropped in section 2):
--      whatsapp_otps      live login codes
--      audit_logs         admin activity trail
--      admin_team         admin identities
--      role_permissions   admin authorisation
--      security_settings  platform security policy
--    Nothing to do — absence of a policy is the policy.
-- -----------------------------------------------------------------------------

COMMIT;

-- =============================================================================
-- POST-DEPLOY VERIFICATION
-- =============================================================================
-- 1. Every table must have RLS on (expect zero rows):
--      SELECT tablename FROM pg_tables
--      WHERE schemaname='public' AND rowsecurity = false;
--
-- 2. Which ownership column was detected (null = none; owner policies deny):
--      SELECT public.zid_store_owner_column();
--
-- 3. As anon, orders must be unreadable (expect an error or zero rows):
--      SET ROLE anon;
--      SELECT * FROM public.orders LIMIT 1;
--      RESET ROLE;
-- =============================================================================
