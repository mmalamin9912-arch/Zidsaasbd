-- =============================================================================
-- ZID Merchant Dashboard — Support & Communication Migration
-- -----------------------------------------------------------------------------
-- Purpose:
--   Persist the Super Admin "Support & Communication" module so every ticket,
--   reply, mass broadcast and global notice banner lives in the database rather
--   than only in the admin's browser:
--
--     1. support_tickets   — merchant support tickets + their message history.
--     2. broadcast_history — mass broadcast (App + Email) delivery records.
--
--   The Global Notice Banner configuration is stored in the existing
--   `platform_config` singleton row (config_key='platform') under the
--   `platformAnnouncement` field, so no new table is needed for it.
--
-- Design rules:
--   - Each table mirrors `audit_logs` (0004): a text `id` primary key plus the
--     frequently-queried fields as real columns, with a JSONB `payload` holding
--     the whole document so the shape can evolve without a migration.
--   - RLS is enabled; the admin routes use the service-role key (bypasses RLS).
--   - All statements are idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. support_tickets (one row per ticket; messages stored as JSONB array)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id text PRIMARY KEY,
  store_name text,
  merchant_email text,
  subject text,
  category text,
  priority text,
  status text NOT NULL DEFAULT 'Open',
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON public.support_tickets (status);
CREATE INDEX IF NOT EXISTS support_tickets_created_at_idx ON public.support_tickets (created_at DESC);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_tickets_admin_all ON public.support_tickets;
CREATE POLICY support_tickets_admin_all
  ON public.support_tickets
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);


-- -----------------------------------------------------------------------------
-- 2. broadcast_history (one row per mass broadcast)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.broadcast_history (
  id text PRIMARY KEY,
  timestamp timestamptz NOT NULL DEFAULT now(),
  audience text,
  subject text,
  type text,
  body text,
  status text NOT NULL DEFAULT 'Delivered',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS broadcast_history_timestamp_idx ON public.broadcast_history (timestamp DESC);

ALTER TABLE public.broadcast_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS broadcast_history_admin_all ON public.broadcast_history;
CREATE POLICY broadcast_history_admin_all
  ON public.broadcast_history
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

COMMIT;
