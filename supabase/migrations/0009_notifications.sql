-- =============================================================================
-- ZID Merchant Dashboard — Merchant Notifications Migration
-- -----------------------------------------------------------------------------
-- Purpose:
--   Persist the merchant dashboard notification bell feed so a Super Admin
--   broadcast actually reaches the merchants' bell instead of dying on the
--   admin's screen.
--
--   Before this migration the `notifications` table did not exist in the live
--   Supabase project, so `writeSupabaseRow()` in lib/notificationStore.ts
--   answered HTTP 404 (PGRST205 "Could not find the table 'public.notifications'")
--   and the read in `readNotificationsForMerchant()` returned nothing. When
--   MongoDB was ALSO unreachable, `createNotification()` returned `ok: false`
--   with no sources at all — the exact "broadcast saves nowhere and the bell
--   stays empty" failure this migration fixes.
--
-- Shape mirror:
--   The column names below are EXACTLY the snake_case keys written by
--   `createNotification()` in lib/notificationStore.ts. If those keys change,
--   this table must change with them.
--
-- Read-state model (see the long comment in lib/notificationStore.ts):
--   • targetAudience='specific' → `is_read` on the row is authoritative.
--   • targetAudience='all'      → `read_by` JSONB map is authoritative, keyed by
--     the merchant's store id/slug. One shared `is_read` would let the first
--     merchant to open the popup clear the badge for everybody else.
--
-- Design rules:
--   - Mirrors `broadcast_history` (0005): text `id` primary key, the frequently
--     queried columns as real fields, JSONB for the evolving parts.
--   - RLS is enabled; the server routes use the service-role key (bypasses RLS).
--   - Idempotent: safe to run more than once.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.notifications (
  id text PRIMARY KEY,
  target_audience text NOT NULL DEFAULT 'all',
  merchant_id text,
  merchant_aliases jsonb NOT NULL DEFAULT '[]'::jsonb,
  title text NOT NULL,
  message text,
  type text NOT NULL DEFAULT 'info',
  is_read boolean NOT NULL DEFAULT false,
  read_by jsonb NOT NULL DEFAULT '{}'::jsonb,
  audience_filter text NOT NULL DEFAULT 'all',
  action_url text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The bell reads newest-first for one merchant, so index the sort key.
CREATE INDEX IF NOT EXISTS notifications_created_at_idx
  ON public.notifications (created_at DESC);

-- Targeted sends look the notification up by the store that owns it.
CREATE INDEX IF NOT EXISTS notifications_merchant_id_idx
  ON public.notifications (merchant_id);

-- Audience-wide sends are filtered by target_audience + cohort on every read.
CREATE INDEX IF NOT EXISTS notifications_audience_idx
  ON public.notifications (target_audience, audience_filter);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_admin_all ON public.notifications;
CREATE POLICY notifications_admin_all
  ON public.notifications
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

COMMIT;
