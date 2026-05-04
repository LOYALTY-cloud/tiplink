-- Add missing columns to payout_methods table
-- These are required by syncExternalAccounts, payout-methods/list, remove, and set-default APIs

ALTER TABLE payout_methods 
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS stripe_external_account_id text;

-- Update the existing record for moway44 user to have the stripe_external_account_id
UPDATE payout_methods 
  SET stripe_external_account_id = provider_ref 
  WHERE provider = 'stripe_connect' AND stripe_external_account_id IS NULL;

-- Index for sync lookups by Stripe external account ID
CREATE INDEX IF NOT EXISTS idx_payout_methods_stripe_ext_id 
  ON payout_methods(stripe_external_account_id) WHERE stripe_external_account_id IS NOT NULL;

-- Index for active methods per user (used by list/remove/set-default APIs)
CREATE INDEX IF NOT EXISTS idx_payout_methods_user_active 
  ON payout_methods(user_id, status) WHERE status = 'active';

-- Add payout_destination column to withdrawals table
-- Allows users to choose which external account receives the payout
ALTER TABLE withdrawals
  ADD COLUMN IF NOT EXISTS payout_destination text;
