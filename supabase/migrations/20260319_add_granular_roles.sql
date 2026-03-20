-- 1. Ensure role column exists (idempotent)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS role text DEFAULT 'user';

-- 2. Migrate any existing 'admin' values → 'super_admin'
UPDATE profiles SET role = 'super_admin' WHERE role = 'admin';

-- 3. Drop old constraint if it exists, then add the new one
DO $$
BEGIN
  -- drop any old constraint
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_check'
  ) THEN
    ALTER TABLE profiles DROP CONSTRAINT profiles_role_check;
  END IF;

  -- add new constraint with granular roles
  ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'owner',
    'super_admin',
    'finance_admin',
    'support_admin',
    'user',
    'system'
  ));
END $$;

-- 4. Index for fast role lookups
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
