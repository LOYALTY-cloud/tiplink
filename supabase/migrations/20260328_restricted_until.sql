-- Add restricted_until for time-based auto-unlock
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS restricted_until timestamptz;

-- Track repeat restriction count for escalation
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS restriction_count int DEFAULT 0;

-- Index for efficient auto-unlock queries
CREATE INDEX IF NOT EXISTS idx_profiles_restricted_until
  ON profiles(restricted_until) WHERE restricted_until IS NOT NULL;
