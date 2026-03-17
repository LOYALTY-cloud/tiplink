-- Account status system for closure / suspension enforcement
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS account_status text DEFAULT 'active';

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS status_reason text;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS closed_at timestamptz;

-- Index for admin queries by status
CREATE INDEX IF NOT EXISTS idx_profiles_account_status
ON profiles (account_status);
