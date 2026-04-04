-- Phase 7c: Final 1% upgrades — SLA reminder, user nudge tracking, admin performance
-- Run: psql $DATABASE_URL -f supabase/migrations/20260327_final_operational_upgrades.sql

-- 1. Pre-breach SLA reminder flag
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS reminder_sent boolean NOT NULL DEFAULT false;

-- 2. User nudge tracking (24h + 48h reminders before auto-close)
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS nudge_count int NOT NULL DEFAULT 0;

-- 3. Admin performance tracking table (skill-weighted routing)
CREATE TABLE IF NOT EXISTS admin_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  issue_type text NOT NULL,
  tickets_resolved int NOT NULL DEFAULT 0,
  tickets_unresolved int NOT NULL DEFAULT 0,
  avg_resolution_ms bigint NOT NULL DEFAULT 0,
  success_rate numeric(5,2) NOT NULL DEFAULT 0,
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(admin_id, issue_type)
);

CREATE INDEX IF NOT EXISTS idx_admin_performance_admin ON admin_performance(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_performance_type ON admin_performance(issue_type);

-- RLS
ALTER TABLE admin_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_read_performance"
  ON admin_performance FOR SELECT
  USING (true);

CREATE POLICY "service_upsert_performance"
  ON admin_performance FOR ALL
  USING (true)
  WITH CHECK (true);
