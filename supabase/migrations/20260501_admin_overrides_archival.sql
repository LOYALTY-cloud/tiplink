-- Bound hot admin override data while keeping archived history accessible.

ALTER TABLE admin_overrides
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_admin_overrides_active_created_at_desc
  ON admin_overrides(created_at DESC)
  WHERE is_archived = FALSE;

CREATE INDEX IF NOT EXISTS idx_admin_overrides_archived_created_at_desc
  ON admin_overrides(created_at DESC)
  WHERE is_archived = TRUE;

CREATE INDEX IF NOT EXISTS idx_admin_overrides_active_type_created_at_desc
  ON admin_overrides(override_type, created_at DESC)
  WHERE is_archived = FALSE;

CREATE INDEX IF NOT EXISTS idx_admin_overrides_archived_type_created_at_desc
  ON admin_overrides(override_type, created_at DESC)
  WHERE is_archived = TRUE;

CREATE OR REPLACE FUNCTION archive_old_admin_overrides(retention_days INTEGER DEFAULT 60)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  archived_count INTEGER;
BEGIN
  UPDATE admin_overrides
  SET is_archived = TRUE
  WHERE created_at < now() - make_interval(days => retention_days)
    AND is_archived = FALSE;

  GET DIAGNOSTICS archived_count = ROW_COUNT;
  RETURN archived_count;
END;
$$;