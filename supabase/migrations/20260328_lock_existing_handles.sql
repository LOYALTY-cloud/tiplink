-- Lock all existing handles for 2 weeks.
-- Any profile that already has a handle set gets handle_locked_until = NOW() + 14 days.
-- This ensures nobody can immediately change their handle after the new policy takes effect.
--
-- RUN THIS IN THE SUPABASE SQL EDITOR.

UPDATE profiles
SET handle_locked_until = NOW() + INTERVAL '14 days'
WHERE handle IS NOT NULL
  AND (handle_locked_until IS NULL OR handle_locked_until < NOW());
