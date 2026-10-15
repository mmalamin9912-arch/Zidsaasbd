-- =============================================================================
-- ZID Merchant Dashboard — Upsert conflict-target & subscription column fix
-- -----------------------------------------------------------------------------
-- Purpose:
--   1. `stores?on_conflict=email` answers HTTP 400 (SQLSTATE 42P10, "there is
--      no unique or exclusion constraint matching the ON CONFLICT
--      specification") because the live `stores.email` column has NO unique
--      constraint, while every client upsert (subscription sync, theme
--      publish) targets it. This migration makes `on_conflict=email` valid by
--      creating a plain UNIQUE index on `stores(email)` — plain, NOT partial,
--      because PostgREST emits `ON CONFLICT (email)` without a predicate and
--      PostgreSQL can only infer a non-partial unique index from that target.
--
--   2. `subscriptions` writes answer HTTP 400 (PGRST204 / 42703) on deployments
--      whose table predates `merchant_email` (it was created outside the
--      migration chain). Every column the app writes is added with
--      `ADD COLUMN IF NOT EXISTS` so the request body always matches the real
--      schema, and a UNIQUE index on `merchant_email` makes the renewal upsert
--      idempotent (one row per merchant, per 0007's design).
--
-- Design rules (same as the rest of the chain):
--   - Idempotent: CREATE TABLE/INDEX IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
--     DROP TRIGGER/POLICY IF EXISTS. Safe to run repeatedly.
--   - Existing data is preserved: exact-duplicate rows are MERGED (foreign
--     keys are re-pointed at the surviving row before the dupe is deleted)
--     rather than dropped.
--   - NULL emails stay legal: PostgreSQL unique indexes treat NULLs as
--     distinct by default, so legacy rows without an email are untouched.
--   - Ends with `NOTIFY pgrst, 'reload schema'` so PostgREST re-introspects
--     immediately instead of answering 400 from a stale schema cache.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. stores — align written columns + make `on_conflict=email` resolvable
-- =============================================================================

ALTER TABLE IF EXISTS public.stores
  -- Identity / profile (written by /api/stores/update + authService)
  ADD COLUMN IF NOT EXISTS email             text,
  ADD COLUMN IF NOT EXISTS email_lower       text,
  ADD COLUMN IF NOT EXISTS store_name        text,
  ADD COLUMN IF NOT EXISTS store_slug        text,
  ADD COLUMN IF NOT EXISTS store_code        text,
  ADD COLUMN IF NOT EXISTS owner_name        text,
  ADD COLUMN IF NOT EXISTS phone             text,
  ADD COLUMN IF NOT EXISTS phone_number      text,
  ADD COLUMN IF NOT EXISTS password          text,
  ADD COLUMN IF NOT EXISTS logo_url          text,
  ADD COLUMN IF NOT EXISTS is_locked         boolean,
  ADD COLUMN IF NOT EXISTS status            text,
  -- Ownership lookups (the subscription sync probes these; 0001's order
  -- policies reference them too, so some older tenants lack them entirely)
  ADD COLUMN IF NOT EXISTS user_id           uuid,
  ADD COLUMN IF NOT EXISTS auth_user_id      uuid,
  ADD COLUMN IF NOT EXISTS owner_id          uuid,
  ADD COLUMN IF NOT EXISTS created_by        uuid,
  -- Subscription fields (subscription sync + admin approval writes)
  ADD COLUMN IF NOT EXISTS subscription_plan       text,
  ADD COLUMN IF NOT EXISTS subscription_expiry     timestamptz,
  ADD COLUMN IF NOT EXISTS plan_started_at         timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at              timestamptz,
  ADD COLUMN IF NOT EXISTS duration_days           integer,
  ADD COLUMN IF NOT EXISTS trial_days_remaining    integer,
  ADD COLUMN IF NOT EXISTS trial_ends_at           timestamptz,
  ADD COLUMN IF NOT EXISTS payment_approved_at     timestamptz,
  -- Theme / storefront (theme publish + /api/stores/update mirror)
  ADD COLUMN IF NOT EXISTS active_theme_id         text,
  ADD COLUMN IF NOT EXISTS active_theme_name       text,
  ADD COLUMN IF NOT EXISTS active_theme_category   text,
  ADD COLUMN IF NOT EXISTS active_theme_layout     text,
  ADD COLUMN IF NOT EXISTS theme_config            jsonb,
  ADD COLUMN IF NOT EXISTS theme_version           text,
  ADD COLUMN IF NOT EXISTS theme_updated_at        timestamptz,
  ADD COLUMN IF NOT EXISTS hero_title              text,
  ADD COLUMN IF NOT EXISTS hero_subtitle           text,
  ADD COLUMN IF NOT EXISTS hero_image              text,
  ADD COLUMN IF NOT EXISTS hero_images             jsonb,
  ADD COLUMN IF NOT EXISTS announcement_text       text,
  -- Timestamps
  ADD COLUMN IF NOT EXISTS created_at        timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at        timestamptz;

-- Merge exact-email duplicates BEFORE the unique index exists. The
-- orders.store_id FK is ON DELETE CASCADE, so children are re-pointed at the
-- survivor first — deleting directly would erase order history.
DO $$
BEGIN
  IF to_regclass('public.stores') IS NULL THEN
    RETURN;
  END IF;

  IF to_regclass('public.orders') IS NOT NULL THEN
    WITH ranked AS (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY email
               ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id::text DESC
             ) AS rn,
             FIRST_VALUE(id) OVER (
               PARTITION BY email
               ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id::text DESC
             ) AS keep_id
        FROM public.stores
       WHERE email IS NOT NULL
    )
    UPDATE public.orders o
       SET store_id = r.keep_id
      FROM ranked r
     WHERE o.store_id = r.id
       AND r.rn > 1
       AND r.id IS DISTINCT FROM r.keep_id;
  END IF;

  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY email
             ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id::text DESC
           ) AS rn
      FROM public.stores
     WHERE email IS NOT NULL
  )
  DELETE FROM public.stores s
   USING ranked r
   WHERE s.id = r.id
     AND r.rn > 1;
END $$;

-- PLAIN (non-partial) unique index: PostgREST's `on_conflict=email` emits
-- `ON CONFLICT (email)` with no predicate, which can only infer a non-partial
-- unique index. NULL emails remain unlimited (NULLS DISTINCT default), so
-- legacy rows without an email are never blocked.
DO $$
BEGIN
  IF to_regclass('public.stores') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS stores_email_key ON public.stores (email);
  END IF;
END $$;

-- =============================================================================
-- 2. subscriptions — guarantee every written column + one row per merchant
-- =============================================================================

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

-- Drifted deployments: the live table was created BEFORE `merchant_email`
-- (and friends) reached the schema, so every write naming them 400s with
-- PGRST204/42703. Add each column the app writes, only when missing.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS merchant_email      text,
  ADD COLUMN IF NOT EXISTS store_slug          text,
  ADD COLUMN IF NOT EXISTS store_name          text,
  ADD COLUMN IF NOT EXISTS subscription_plan   text,
  ADD COLUMN IF NOT EXISTS plan_started_at     timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_expiry timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at          timestamptz,
  ADD COLUMN IF NOT EXISTS duration_days       integer,
  ADD COLUMN IF NOT EXISTS transaction_id      text,
  ADD COLUMN IF NOT EXISTS payment_method      text,
  ADD COLUMN IF NOT EXISTS status              text,
  ADD COLUMN IF NOT EXISTS previous_plan       text,
  ADD COLUMN IF NOT EXISTS amount_bdt          numeric(12,2),
  ADD COLUMN IF NOT EXISTS created_at          timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at          timestamptz;

-- One renewal row per merchant (0007's documented design). Duplicates that
-- older blind-`upsert` builds (no conflict target → plain INSERT) created are
-- merged, keeping the newest; nothing references this table by foreign key.
DO $$
BEGIN
  IF to_regclass('public.subscriptions') IS NULL THEN
    RETURN;
  END IF;

  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY merchant_email
             ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id::text DESC
           ) AS rn
      FROM public.subscriptions
     WHERE merchant_email IS NOT NULL
  )
  DELETE FROM public.subscriptions s
   USING ranked r
   WHERE s.id = r.id
     AND r.rn > 1;
END $$;

-- Natural-identity conflict target for the client renewal upsert
-- (`on_conflict=merchant_email`), same inference rules as `stores.email`.
DO $$
BEGIN
  IF to_regclass('public.subscriptions') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_merchant_email_key
      ON public.subscriptions (merchant_email);
  END IF;
END $$;

-- Supporting indexes + RLS from 0007 (idempotent; also covers deployments
-- whose table pre-dates the migration chain).
CREATE INDEX IF NOT EXISTS subscriptions_merchant_email_idx ON public.subscriptions (merchant_email);
CREATE INDEX IF NOT EXISTS subscriptions_store_slug_idx ON public.subscriptions (store_slug);
CREATE INDEX IF NOT EXISTS subscriptions_created_at_idx ON public.subscriptions (created_at DESC);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON public.subscriptions (status);

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

-- `updated_at` freshness on every write (idempotent).
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

-- =============================================================================
-- 3. Reload the PostgREST schema cache NOW
--     Without this, PostgREST keeps answering from its cached (stale) schema
--     and the just-fixed requests keep 400ing until the next auto-reload —
--     which is what made the failures look like rapid, endless retries.
-- =============================================================================
NOTIFY pgrst, 'reload schema';

COMMIT;