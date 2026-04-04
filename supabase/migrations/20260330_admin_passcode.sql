-- Add separate admin_passcode column so admin_id is not used as a login credential
-- admin_id = display identifier (e.g. OWN-Y3R86L)
-- admin_passcode = login secret (e.g. OWN-Y3R86L-KP4W)
-- 2026-03-30

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS admin_passcode TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_admin_passcode
  ON profiles(admin_passcode) WHERE admin_passcode IS NOT NULL;

-- Backfill: give existing admins a passcode based on their current admin_id + 4 random chars
-- Run this once, then new admins get passcodes automatically via the create-admin API
UPDATE profiles
SET admin_passcode = admin_id || '-' || substr(md5(random()::text), 1, 4)
WHERE admin_id IS NOT NULL AND admin_passcode IS NULL;
