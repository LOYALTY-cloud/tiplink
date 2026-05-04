-- COPY AND PASTE THIS INTO YOUR SUPABASE SQL EDITOR
-- Go to: https://supabase.com/dashboard/project/cjakxygbgijsknoadrrs/sql/new
--
-- PURPOSE: Adds is_applied_unlock flag so that themes applied via
--          "buy/unlock theme" are hidden from /themebuilder but still
--          render on the public profile page (is_active = true still works).

ALTER TABLE themes
  ADD COLUMN IF NOT EXISTS is_applied_unlock boolean NOT NULL DEFAULT false;

-- Partial index speeds up the /api/themes/saved query (creator-made themes only)
CREATE INDEX IF NOT EXISTS themes_applied_unlock_idx
  ON themes (user_id, is_applied_unlock)
  WHERE is_applied_unlock = false;

-- ✅ After running this:
--   • /themebuilder will only show creator-made themes
--   • Purchased/applied themes will still be active on the public profile
