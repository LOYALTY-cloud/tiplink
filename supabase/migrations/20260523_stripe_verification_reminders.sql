-- Track admin-sent Stripe verification reminder emails on profiles.
-- Max 2 emails per user, enforced at the API level (72h cooldown between sends).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_reminder_sent_count   int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_reminder_last_sent_at timestamptz;

COMMENT ON COLUMN public.profiles.stripe_reminder_sent_count   IS 'Number of Stripe verification reminder emails sent by admin. Max 2 total.';
COMMENT ON COLUMN public.profiles.stripe_reminder_last_sent_at IS 'Timestamp of the last Stripe verification reminder email sent by admin.';
