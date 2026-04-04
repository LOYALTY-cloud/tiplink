-- Add closed_by to support_sessions + update stale cleanup with grace periods
-- Run in Supabase SQL Editor

-- Track who closed the session: 'system', 'admin', or 'user'
ALTER TABLE support_sessions
ADD COLUMN IF NOT EXISTS closed_by text DEFAULT NULL;

-- Replace stale session function with grace-period logic:
--   waiting → 30 min timeout
--   active  → 60 min timeout
CREATE OR REPLACE FUNCTION close_stale_support_sessions()
RETURNS integer AS $$
DECLARE
  closed_count integer;
BEGIN
  WITH closed AS (
    UPDATE support_sessions
    SET status = 'closed',
        closed_by = 'system',
        updated_at = now()
    WHERE (
      (status = 'waiting' AND updated_at < now() - interval '30 minutes')
      OR
      (status = 'active' AND updated_at < now() - interval '60 minutes')
    )
    RETURNING id
  )
  SELECT count(*) INTO closed_count FROM closed;

  RETURN closed_count;
END;
$$ LANGUAGE plpgsql;
