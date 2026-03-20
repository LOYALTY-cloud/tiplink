-- ============================================================
-- BACKFILL: Sync auth.users email → profiles.email
-- + Add missing notification preference columns to user_settings
-- ============================================================
-- Run this ONCE in Supabase Dashboard → SQL Editor
-- Safe to run multiple times (IF NOT EXISTS / only updates nulls).
-- ============================================================

-- 1. Add the missing notification columns to user_settings
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS notify_tips     boolean NOT NULL DEFAULT true;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS notify_payouts  boolean NOT NULL DEFAULT true;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS notify_security boolean NOT NULL DEFAULT true;

-- 2. Sync auth.users email → profiles.email (only where null)
UPDATE profiles p
SET email = u.email
FROM auth.users u
WHERE p.user_id = u.id
  AND p.email IS NULL
  AND u.email IS NOT NULL;

-- 3. Backfill user_settings for users who don't have a row
INSERT INTO user_settings (user_id)
SELECT user_id
FROM profiles
WHERE user_id NOT IN (SELECT user_id FROM user_settings);

-- ============================================================
-- VERIFY:
--   SELECT count(*) FROM profiles WHERE email IS NULL;
--   (should be 0 after running)
--
--   SELECT count(*) FROM user_settings;
--   (should match count of profiles)
--
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'user_settings' ORDER BY ordinal_position;
--   (should include notify_tips, notify_payouts, notify_security)
-- ============================================================
