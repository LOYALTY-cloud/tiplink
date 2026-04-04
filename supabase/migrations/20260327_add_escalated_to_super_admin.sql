-- Add escalated_to_super_admin flag to track when tiered routing
-- falls back to super_admin because no exact-role admin was available.
ALTER TABLE support_sessions
  ADD COLUMN IF NOT EXISTS escalated_to_super_admin boolean DEFAULT false;
