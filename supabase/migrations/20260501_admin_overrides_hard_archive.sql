-- Move archived admin overrides out of the hot table while keeping history queryable.

CREATE TABLE IF NOT EXISTS admin_overrides_archive (
  id UUID PRIMARY KEY,
  admin_id UUID NOT NULL,
  target_user UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  override_type TEXT NOT NULL,
  previous_value JSONB,
  new_value JSONB,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  is_archived BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_admin_overrides_archive_created_at_desc
  ON admin_overrides_archive(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_overrides_archive_type_created_at_desc
  ON admin_overrides_archive(override_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_overrides_archive_target_created_at_desc
  ON admin_overrides_archive(target_user, created_at DESC);

ALTER TABLE admin_overrides_archive ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_overrides_archive'
      AND policyname = 'Service role full access on admin_overrides_archive'
  ) THEN
    CREATE POLICY "Service role full access on admin_overrides_archive"
      ON admin_overrides_archive FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION move_archived_admin_overrides_to_archive(
  retention_days INTEGER DEFAULT 60,
  batch_size INTEGER DEFAULT 5000
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  moved_count INTEGER;
BEGIN
  WITH candidates AS (
    SELECT id
    FROM admin_overrides
    WHERE is_archived = TRUE
      AND created_at < now() - make_interval(days => retention_days)
    ORDER BY created_at ASC
    LIMIT batch_size
  ),
  moved_rows AS (
    INSERT INTO admin_overrides_archive (
      id,
      admin_id,
      target_user,
      override_type,
      previous_value,
      new_value,
      reason,
      created_at,
      is_archived
    )
    SELECT
      src.id,
      src.admin_id,
      src.target_user,
      src.override_type,
      src.previous_value,
      src.new_value,
      src.reason,
      src.created_at,
      TRUE
    FROM admin_overrides src
    INNER JOIN candidates c ON c.id = src.id
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  ),
  deleted AS (
    DELETE FROM admin_overrides active
    USING candidates
    WHERE active.id = candidates.id
    RETURNING active.id
  )
  SELECT COUNT(*) INTO moved_count FROM deleted;
  RETURN moved_count;
END;
$$;