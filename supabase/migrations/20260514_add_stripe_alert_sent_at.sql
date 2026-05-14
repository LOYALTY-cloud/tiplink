-- Tracks when the last admin alert email was sent for a restricted Stripe account.
-- Used by syncStripeAccount to deduplicate "creator restricted" alerts:
--   • Only fires immediately when an account newly becomes high_risk
--   • After that, re-fires at most once per 24 hours while it stays restricted
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_alert_sent_at timestamptz DEFAULT NULL;
