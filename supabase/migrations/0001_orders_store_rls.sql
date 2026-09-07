-- =============================================================================
-- ZID Merchant Dashboard — Orders RLS Migration
-- -----------------------------------------------------------------------------
-- Purpose:
--   Orders must always reference a REAL store row in the 'stores' table via
--   store_id (a store UUID) — never a slug. This migration:
--     1. Backfills legacy slug-based store_id values to the real store UUID.
--     2. Casts store_id to uuid and adds a foreign key to stores(id).
--     3. Enables Row Level Security on 'stores' and 'orders'.
--     4. Adds RLS policies that keep every order query safely targeted on
--        'stores' (insert only into an existing store; read only by its owner).
--
-- NOTE: The checkout/order code (App.tsx) and the /api/orders routes already
-- resolve store_id from the slug against the 'stores' table, so new inserts
-- carry the real UUID. This migration locks the schema down to match.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Safe idempotent guard — run the whole thing as one transaction.
-- -----------------------------------------------------------------------------
BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Backfill legacy slug values in orders.store_id from the canonical stores
--    rows. (Previous versions wrote the slug string here; those must become
--    the real store UUID so the FK below can be enforced.)
-- -----------------------------------------------------------------------------
UPDATE public.orders o
SET store_id = s.id::text
FROM public.stores s
WHERE o.store_id IS NOT NULL
  AND o.store_id <> ''
  AND lower(trim(o.store_id)) = lower(trim(s.store_slug));

-- Any remaining non-null store_id values that are not valid UUIDs cannot be
-- mapped to a real store — null them so the type cast / FK can succeed and the
-- row is not silently orphaned. (These are historical draft rows only.)
UPDATE public.orders
SET store_id = NULL
WHERE store_id IS NOT NULL
  AND store_id <> ''
  AND store_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- -----------------------------------------------------------------------------
-- 2. Normalize orders.store_id to uuid and reference stores(id).
-- -----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.orders_store_id_idx;
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_store_id_fkey;

ALTER TABLE public.orders
  ALTER COLUMN store_id DROP NOT NULL;

ALTER TABLE public.orders
  ALTER COLUMN store_id TYPE uuid
  USING CASE
    WHEN store_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN store_id::uuid
    ELSE NULL
  END;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_store_id_fkey
  FOREIGN KEY (store_id) REFERENCES public.stores (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS orders_store_id_idx ON public.orders (store_id);

-- -----------------------------------------------------------------------------
-- 3. Enable Row Level Security on the tenant tables.
-- -----------------------------------------------------------------------------
ALTER TABLE public.stores  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders  ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 4. Policies (all targeted safely on 'stores'):
--    INSERT  — any client may create an order, but ONLY if the referenced store
--              actually exists in the stores table (prevents orphan rows and
--              free-form store_id values).
--    SELECT  — only the store owner can read that store's orders.
--    UPDATE  — only the store owner can modify that store's orders.
--    DELETE  — only the store owner can delete that store's orders.
-- -----------------------------------------------------------------------------

-- 4a. Insert — validates the target store exists. Public storefronts check out
--     as "anon", so grant both anon and authenticated.
DROP POLICY IF EXISTS orders_insert_store_exists ON public.orders;
CREATE POLICY orders_insert_store_exists
  ON public.orders
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.stores s
      WHERE s.id = orders.store_id
    )
  );

-- 4b. Select — owner-only via stores.
DROP POLICY IF EXISTS orders_select_owner ON public.orders;
CREATE POLICY orders_select_owner
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.stores s
      WHERE s.id = orders.store_id
        AND (
              s.user_id     = auth.uid()
          OR  s.auth_user_id = auth.uid()
          OR  s.owner_id    = auth.uid()
              -- Legacy column fallbacks (some tenants have different owner cols)
          OR  s.created_by  = auth.uid()
        )
    )
  );

-- 4c. Update — owner-only.
DROP POLICY IF EXISTS orders_update_owner ON public.orders;
CREATE POLICY orders_update_owner
  ON public.orders
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.stores s
      WHERE s.id = orders.store_id
        AND (
              s.user_id      = auth.uid()
          OR  s.auth_user_id = auth.uid()
          OR  s.owner_id     = auth.uid()
          OR  s.created_by   = auth.uid()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.stores s
      WHERE s.id = orders.store_id
        AND (
              s.user_id      = auth.uid()
          OR  s.auth_user_id = auth.uid()
          OR  s.owner_id     = auth.uid()
          OR  s.created_by   = auth.uid()
        )
    )
  );

-- 4d. Delete — owner-only.
DROP POLICY IF EXISTS orders_delete_owner ON public.orders;
CREATE POLICY orders_delete_owner
  ON public.orders
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.stores s
      WHERE s.id = orders.store_id
        AND (
              s.user_id      = auth.uid()
          OR  s.auth_user_id = auth.uid()
          OR  s.owner_id     = auth.uid()
          OR  s.created_by   = auth.uid()
        )
    )
  );

-- -----------------------------------------------------------------------------
-- 5. Ordering guard:
--    New orders must never be created without a valid store_id except by the
--    service role (used by the /api/* serverless functions with the service key,
--    which bypasses RLS). Enforce a NOT NULL for the anon/authenticated path via
--    the INSERT policy above (store must exist), and keep the column itself
--    nullable only for Service-Role admin imports.
-- -----------------------------------------------------------------------------

COMMIT;
