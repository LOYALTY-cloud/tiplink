-- Add flag to distinguish creator-made themes from applied purchased themes.
-- Purchased themes applied via /api/themes/apply-user-theme will have this set
-- to true and will be excluded from the themebuilder (/api/themes/saved).
-- The public profile page still reads is_active=true regardless of this flag.

ALTER TABLE themes
  ADD COLUMN IF NOT EXISTS is_applied_unlock boolean NOT NULL DEFAULT false;

-- Index for the saved-themes query filter
CREATE INDEX IF NOT EXISTS themes_applied_unlock_idx
  ON themes (user_id, is_applied_unlock)
  WHERE is_applied_unlock = false;
