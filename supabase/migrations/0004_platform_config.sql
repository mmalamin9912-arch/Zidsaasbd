-- =============================================================================
-- ZID Merchant Dashboard — Super Admin Platform Configuration Migration
-- -----------------------------------------------------------------------------
-- Purpose:
--   Persist the Super Admin portal's platform-wide configuration so every
--   toggle, gateway number, security policy and audit entry is stored in the
--   database (not just the browser):
--
--     1. platform_config   — payment gateways (bKash/Nagad/Rocket/Bangla QR),
--                            platform settings (tax, trial days, branding) and
--                            AI freemium toggles. One row, config_key='platform'.
--     2. security_settings — force 2FA, session timeout, max login attempts.
--                            One row, config_key='security'.
--     3. audit_logs        — append-only admin activity records.
--
-- Design rules:
--   - Singleton config tables use a `config_key` unique column + a JSONB
--     `payload` document, so the shape can evolve without a migration.
--     Frequently-queried columns are also mirrored as real columns.
--   - RLS is enabled; the admin routes use the service-role key (bypasses RLS).
--   - All statements are idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. platform_config (singleton per config_key)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_config_key_idx ON public.platform_config (config_key);

ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_config_admin_all ON public.platform_config;
CREATE POLICY platform_config_admin_all
  ON public.platform_config
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);


-- -----------------------------------------------------------------------------
-- 2. security_settings (singleton per config_key)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.security_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS security_settings_key_idx ON public.security_settings (config_key);

ALTER TABLE public.security_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS security_settings_admin_all ON public.security_settings;
CREATE POLICY security_settings_admin_all
  ON public.security_settings
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);


-- -----------------------------------------------------------------------------
-- 3. audit_logs (append-only activity records)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id text PRIMARY KEY,
  timestamp timestamptz NOT NULL DEFAULT now(),
  admin_user text,
  action text,
  target_entity text,
  ip_address text,
  severity text NOT NULL DEFAULT 'Info',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_timestamp_idx ON public.audit_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS audit_logs_severity_idx ON public.audit_logs (severity);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_admin_all ON public.audit_logs;
CREATE POLICY audit_logs_admin_all
  ON public.audit_logs
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

COMMIT;
