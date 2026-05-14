-- Tracks when the last requirement-notification email was sent to a creator.
-- syncStripeAccount uses this to cap user-facing restriction emails at
-- 2 per day (minimum 8 hours apart).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_user_notified_at timestamptz DEFAULT NULL;
