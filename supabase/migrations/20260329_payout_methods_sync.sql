-- Add external account sync support to payout_methods
-- 2026-03-29

-- Add stripe_external_account_id for Connect external accounts
ALTER TABLE payout_methods
  ADD COLUMN IF NOT EXISTS stripe_external_account_id TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Index for external account lookups
CREATE INDEX IF NOT EXISTS idx_payout_methods_external_account
  ON payout_methods(stripe_external_account_id)
  WHERE stripe_external_account_id IS NOT NULL;
