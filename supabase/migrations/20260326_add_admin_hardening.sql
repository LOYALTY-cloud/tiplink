-- Add admin hardening columns: invite_status + is_active
-- Run in Supabase SQL Editor

-- invite_status: tracks whether a provisioned admin has logged in
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS invite_status text DEFAULT NULL;

-- is_active: allows deactivating an admin without deleting their account
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Set existing admins as accepted + active
UPDATE profiles
SET invite_status = 'accepted', is_active = true
WHERE role IN ('owner', 'super_admin', 'finance_admin', 'support_admin')
  AND admin_id IS NOT NULL;

-- Unique constraint on admin_id (prevents collision at DB level)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_admin_id_unique
ON profiles (admin_id)
WHERE admin_id IS NOT NULL;

-- last_active_at: tracks admin's last activity timestamp
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS last_active_at timestamp DEFAULT NULL;
