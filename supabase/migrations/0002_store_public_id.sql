-- =============================================================================
-- ZID Merchant Dashboard — Permanent Store Identification Migration
-- -----------------------------------------------------------------------------
-- Purpose:
--   Give every store a PERMANENT, human-readable system ID ("store_code",
--   e.g. ZID-BD-1001) alongside the canonical Supabase UUID ('stores.id').
--
--   * store_code is immutable identity: slug/name changes NEVER touch it.
--   * resolve_store_ref() resolves ANY store reference (store_code, UUID or
--     slug) to the canonical stores.id so all queries go through the UUID.
--   * products/orders can carry the permanent code as display metadata, but
--     all ownership/RLS joins remain keyed on the UUID FK from 0001.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Permanent public store code column (unique + indexed).
--    Format: 'ZID-BD-' followed by a 4+ digit zero-padded sequence number.
-- -----------------------------------------------------------------------------
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS store_code text;

-- Unique index (partial so legacy rows without a code are not blocked).
CREATE UNIQUE INDEX IF NOT EXISTS stores_store_code_key
  ON public.stores (store_code)
  WHERE store_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS stores_store_code_idx
  ON public.stores (store_code);

-- -----------------------------------------------------------------------------
-- 2. Backfill: assign a permanent ZID-BD-XXXX to every store that lacks one.
--    Uses a sequence starting at 1001 so ids look like ZID-BD-1001, ZID-BD-1002…
-- -----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS store_code_seq START 1001;

UPDATE public.stores s
SET store_code = 'ZID-BD-' || LPAD(nextval('store_code_seq')::text, 4, '0')
WHERE s.store_code IS NULL OR s.store_code = '';

-- Deterministic fallback for any row inserted concurrently between the
-- backfill and the default below (hash-based, still unique per store).
UPDATE public.stores s
SET store_code = 'ZID-BD-' || LPAD(
      (('x' || substr(md5(s.id::text), 1, 8))::bit(32)::bigint % 8999 + 1000)::text, 4, '0')
WHERE s.store_code IS NULL OR s.store_code = '';

-- Auto-assign for future inserts that forget to set one.
DROP TRIGGER IF EXISTS trg_stores_store_code_default ON public.stores;
CREATE OR REPLACE FUNCTION public.set_store_code_default()
RETURNS trigger AS $$
BEGIN
  IF NEW.store_code IS NULL OR NEW.store_code = '' THEN
    NEW.store_code := 'ZID-BD-' || LPAD(nextval('store_code_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stores_store_code_default
  BEFORE INSERT ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.set_store_code_default();

-- -----------------------------------------------------------------------------
-- 3. Guard: the store code is permanent identity metadata. It is set once
--    (on insert / when NULL) and must never be overwritten afterwards, so
--    slug or name edits can never silently re-identify a store.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_store_code()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.store_code IS NOT NULL
     AND NEW.store_code IS DISTINCT FROM OLD.store_code THEN
    RAISE EXCEPTION 'store_code is permanent and cannot be changed (store %)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stores_protect_store_code ON public.stores;
CREATE TRIGGER trg_stores_protect_store_code
  BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.protect_store_code();

-- -----------------------------------------------------------------------------
-- 4. Universal resolver: store_code | UUID | slug -> canonical stores.id.
--    All order/product lookups can safely funnel through this; slug is only a
--    fallback so renaming a store or custom slug never breaks resolution when
--    callers have already attached the permanent ID/UUID.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_store_ref(ref text)
RETURNS uuid AS $$
DECLARE
  clean text := lower(btrim(coalesce(ref, '')));
  resolved uuid;
BEGIN
  IF clean = '' THEN RETURN NULL; END IF;

  -- 1) Already a UUID (canonical id) — validate & use directly.
  IF clean ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT id INTO resolved FROM public.stores WHERE id = clean::uuid LIMIT 1;
    IF resolved IS NOT NULL THEN RETURN resolved; END IF;
  END IF;

  -- 2) Permanent store code (ZID-BD-XXXX), case-insensitive.
  SELECT id INTO resolved FROM public.stores
  WHERE lower(store_code) = clean LIMIT 1;
  IF resolved IS NOT NULL THEN RETURN resolved; END IF;

  -- 3) Slug fallback (display/route-level reference only).
  SELECT id INTO resolved FROM public.stores
  WHERE lower(store_slug) = clean LIMIT 1;
  IF resolved IS NOT NULL THEN RETURN resolved; END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 5. Helpful views/indices for tenant queries that used to go through slugs.
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS orders_store_code_lookup
  ON public.orders (store_id);

COMMIT;
