-- =============================================================================
-- ZID Merchant Dashboard — Admin Team & Role Permissions Migration
-- -----------------------------------------------------------------------------
-- Purpose:
--   Persist the Super Admin portal's team roster and role→tab permission matrix
--   in the database instead of only the browser's localStorage:
--
--     1. admin_team         — one row per admin team member (name, email, role,
--                             status). Keyed by the member `id`.
--     2. role_permissions   — one singleton row per role, holding the list of
--                             sub-tabs that role may access. config_key='roles'.
--
-- Design rules:
--   - Mirrors `audit_logs` (0004): a text `id`/`config_key` primary key plus a
--     JSONB `payload` holding the whole document so the shape can evolve.
--   - RLS is enabled; the admin routes use the service-role key (bypasses RLS).
--   - All statements are idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. admin_team (one row per admin team member)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_team (
  id text PRIMARY KEY,
  full_name text,
  email text,
  role text,
  last_active timestamptz,
  status text NOT NULL DEFAULT 'Active',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_team_status_idx ON public.admin_team (status);

ALTER TABLE public.admin_team ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_team_admin_all ON public.admin_team;
CREATE POLICY admin_team_admin_all
  ON public.admin_team
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);


-- -----------------------------------------------------------------------------
-- 2. role_permissions (singleton per config_key='roles')
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS role_permissions_key_idx ON public.role_permissions (config_key);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS role_permissions_admin_all ON public.role_permissions;
CREATE POLICY role_permissions_admin_all
  ON public.role_permissions
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

COMMIT;
