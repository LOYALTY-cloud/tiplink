-- Direct-charge migration: record the exact connected account the PaymentIntent
-- was created on, so refunds/disputes/reconciliation never depend on a
-- creator's current (possibly changed) profile.stripe_account_id.
ALTER TABLE tip_intents
  ADD COLUMN IF NOT EXISTS stripe_account_id text;

CREATE INDEX IF NOT EXISTS idx_tip_intents_stripe_account_id
  ON tip_intents(stripe_account_id);
