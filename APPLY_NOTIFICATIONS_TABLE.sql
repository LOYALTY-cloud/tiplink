-- ============================================================
-- NOTIFICATIONS TABLE MIGRATION
-- ============================================================
-- Run this in: Supabase Dashboard → SQL Editor
-- This creates the notifications table needed for the
-- bell icon, realtime push, and email notification pipeline.
-- ============================================================

-- 1. Create the table
CREATE TABLE IF NOT EXISTS notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  type       text NOT NULL,       -- tip, payout, security
  title      text NOT NULL,
  body       text NOT NULL,
  read       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Add indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON notifications(user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id) WHERE read = false;

-- 3. Enable Row Level Security
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies (users can only see/update their own notifications)
DO $$ BEGIN
  CREATE POLICY "Users can read own notifications"
    ON notifications FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own notifications"
    ON notifications FOR UPDATE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 5. Enable Supabase Realtime (instant bell icon updates)
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- ============================================================
-- VERIFY: After running, execute this to confirm:
--   SELECT count(*) FROM notifications;
-- Should return 0 (empty table, ready to use).
-- ============================================================
