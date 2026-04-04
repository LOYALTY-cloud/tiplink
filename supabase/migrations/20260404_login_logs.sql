-- Login logs: track IP, user-agent, device fingerprint on every auth event.
-- Powers fraud detection + admin forensics.

CREATE TABLE IF NOT EXISTS login_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type   text NOT NULL DEFAULT 'login',  -- login | signup | password_reset | logout
  ip_address   text,
  user_agent   text,
  device_hash  text,       -- SHA-256 of UA + screen + timezone (client-sent)
  country      text,       -- Optional GeoIP
  success      boolean NOT NULL DEFAULT true,
  failure_reason text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_login_logs_user_id  ON login_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_login_logs_ip       ON login_logs(ip_address);
CREATE INDEX IF NOT EXISTS idx_login_logs_created  ON login_logs(created_at DESC);

-- RLS: admins only (no end-user reads)
ALTER TABLE login_logs ENABLE ROW LEVEL SECURITY;

-- Service role can insert/select (API routes run as service role)
CREATE POLICY "service_role_all" ON login_logs
  FOR ALL USING (auth.role() = 'service_role');

-- Helper: flag users who logged in from 3+ distinct IPs within 1 hour
CREATE OR REPLACE FUNCTION check_suspicious_logins(p_user_id uuid, p_window_hours int DEFAULT 1)
RETURNS TABLE(distinct_ips bigint, distinct_devices bigint) AS $$
  SELECT
    COUNT(DISTINCT ip_address)  AS distinct_ips,
    COUNT(DISTINCT device_hash) AS distinct_devices
  FROM login_logs
  WHERE user_id = p_user_id
    AND created_at > now() - (p_window_hours || ' hours')::interval
    AND success = true;
$$ LANGUAGE sql STABLE;
