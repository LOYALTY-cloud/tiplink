-- Track admin access to sensitive routes (financial data, PII, etc.)
CREATE TABLE IF NOT EXISTS admin_access_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id),
  route       TEXT NOT NULL,
  role        TEXT NOT NULL,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookups by user and by route
CREATE INDEX IF NOT EXISTS idx_access_logs_user ON admin_access_logs(user_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_logs_route ON admin_access_logs(route, accessed_at DESC);

-- RLS: service-role only (no client access)
ALTER TABLE admin_access_logs ENABLE ROW LEVEL SECURITY;
