-- Notifications table — stores in-app notifications for users.
-- Source of truth for the bell icon, realtime, and email dispatch.

CREATE TABLE IF NOT EXISTS notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,

  type       text NOT NULL,       -- tip, payout, security
  title      text NOT NULL,
  body       text NOT NULL,

  read       boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id) WHERE read = false;

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- Enable Supabase Realtime so the client gets instant INSERT events
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
