-- ============================================================
-- AUTO-FREEZE + ADMIN RISK PERSISTENCE
--
-- Adds:
--   1) is_frozen, freeze_reason, frozen_at columns to profiles
--   2) admin_risk_score, admin_risk_level columns to profiles
--      (persisted after each admin action evaluation)
-- ============================================================

-- §1 Freeze columns on profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS is_frozen boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS freeze_reason text,
ADD COLUMN IF NOT EXISTS frozen_at timestamptz;

-- Index for quickly finding frozen accounts
CREATE INDEX IF NOT EXISTS idx_profiles_frozen
  ON profiles(is_frozen) WHERE is_frozen = true;

-- §2 Persisted admin risk score on profiles
-- (separate from user risk_score; only meaningful for admin-role users)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS admin_risk_score int DEFAULT 0,
ADD COLUMN IF NOT EXISTS admin_risk_level text DEFAULT 'low';
