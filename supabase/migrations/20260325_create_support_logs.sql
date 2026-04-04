-- Log user support questions for analytics and improvement
CREATE TABLE IF NOT EXISTS support_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_logs_user ON support_logs(user_id, created_at DESC);

-- RLS: service-role only
ALTER TABLE support_logs ENABLE ROW LEVEL SECURITY;
