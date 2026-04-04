-- Rate limiting table + atomic check function
-- Uses ON CONFLICT upsert for race-condition-free counting

CREATE TABLE IF NOT EXISTS rate_limits (
  key text PRIMARY KEY,
  count int NOT NULL DEFAULT 0,
  reset_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON rate_limits(reset_at);

-- Atomic rate limit check: returns TRUE if allowed, FALSE if blocked.
-- If the window has expired, resets the counter.
-- Uses INSERT ... ON CONFLICT to avoid read-then-write race conditions.
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key text,
  p_limit int,
  p_window_sec int
)
RETURNS boolean AS $$
DECLARE
  v_count int;
  v_reset_at timestamptz;
  v_now timestamptz := now();
BEGIN
  -- Try to insert a new row; if it exists, update atomically
  INSERT INTO rate_limits (key, count, reset_at)
  VALUES (p_key, 1, v_now + (p_window_sec || ' seconds')::interval)
  ON CONFLICT (key) DO UPDATE
    SET
      count = CASE
        WHEN rate_limits.reset_at < v_now THEN 1           -- window expired, reset
        ELSE rate_limits.count + 1                          -- same window, increment
      END,
      reset_at = CASE
        WHEN rate_limits.reset_at < v_now
          THEN v_now + (p_window_sec || ' seconds')::interval  -- new window
        ELSE rate_limits.reset_at                               -- keep existing
      END
  RETURNING count, reset_at INTO v_count, v_reset_at;

  RETURN v_count <= p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup: delete expired entries (call via cron)
CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS void AS $$
BEGIN
  DELETE FROM rate_limits WHERE reset_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
