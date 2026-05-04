-- Keep admin override history queries fast as volume grows.

CREATE INDEX IF NOT EXISTS idx_admin_overrides_created_at_desc
  ON admin_overrides(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_overrides_admin_created_at_desc
  ON admin_overrides(admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_overrides_type_created_at_desc
  ON admin_overrides(override_type, created_at DESC);