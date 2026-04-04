-- ============================================================
-- Final 1% Upgrades: Breach Actions, Waiting-On, Auto-Close
-- ============================================================

-- 1. SLA breach notification tracking
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS breach_notified boolean DEFAULT false;

-- 2. Waiting-on state for clarity in admin queue
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS waiting_on text DEFAULT 'admin';
-- values: 'admin' | 'user'

-- 3. Auto-close tracking
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS last_user_reply_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_close_warning_sent boolean DEFAULT false;

-- Index for auto-close cron queries
CREATE INDEX IF NOT EXISTS idx_tickets_auto_close
  ON support_tickets (last_user_reply_at)
  WHERE status IN ('open', 'in_progress') AND auto_close_warning_sent = false;

-- Index for SLA breach cron queries
CREATE INDEX IF NOT EXISTS idx_tickets_breach
  ON support_tickets (breach_notified)
  WHERE breach_notified = false AND status IN ('open', 'in_progress');

-- Backfill: set last_user_reply_at = created_at for existing tickets
UPDATE support_tickets
  SET last_user_reply_at = created_at
  WHERE last_user_reply_at IS NULL;
