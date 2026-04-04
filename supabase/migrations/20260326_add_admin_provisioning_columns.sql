-- Add admin provisioning columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS admin_id text UNIQUE;

-- Index for fast admin_id lookups
CREATE INDEX IF NOT EXISTS idx_profiles_admin_id ON profiles (admin_id) WHERE admin_id IS NOT NULL;
