-- Phase 7b: User support history — AI-generated ticket summaries on user profiles
-- Run: psql $DATABASE_URL -f supabase/migrations/20260327_user_support_history.sql

CREATE TABLE IF NOT EXISTS user_support_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ticket_id uuid NOT NULL,
  issue_type text NOT NULL DEFAULT 'other',
  summary text NOT NULL,
  resolution text NOT NULL,
  outcome text NOT NULL DEFAULT 'resolved',   -- resolved | unresolved
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_support_history_user ON user_support_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_support_history_ticket ON user_support_history(ticket_id);

-- RLS
ALTER TABLE user_support_history ENABLE ROW LEVEL SECURITY;

-- Admins can read all history
CREATE POLICY "admins_read_support_history"
  ON user_support_history FOR SELECT
  USING (true);

-- Only service role inserts (via supabaseAdmin)
CREATE POLICY "service_insert_support_history"
  ON user_support_history FOR INSERT
  WITH CHECK (true);
