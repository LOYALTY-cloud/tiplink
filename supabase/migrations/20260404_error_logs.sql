-- Error log table for centralized monitoring.
-- Captures API failures, Stripe errors, auth issues, and unhandled exceptions.

CREATE TABLE IF NOT EXISTS error_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source      text NOT NULL,           -- e.g. "api/payments/create", "stripe/webhook", "auth/signup"
  severity    text NOT NULL DEFAULT 'error',  -- error | warning | critical
  message     text NOT NULL,
  stack       text,                    -- stack trace (truncated)
  metadata    jsonb DEFAULT '{}'::jsonb,
  user_id     uuid,                    -- optional: which user was affected
  ip_address  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_created   ON error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_source    ON error_logs(source);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity  ON error_logs(severity);

-- RLS: service role only
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON error_logs
  FOR ALL USING (auth.role() = 'service_role');

-- Auto-cleanup: keep 30 days of logs
CREATE OR REPLACE FUNCTION cleanup_old_error_logs()
RETURNS void AS $$
  DELETE FROM error_logs WHERE created_at < now() - interval '30 days';
$$ LANGUAGE sql;
