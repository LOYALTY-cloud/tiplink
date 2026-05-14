-- Add temporary unfreeze window to profiles.
-- When set, the account is treated as unfrozen until this timestamp expires.
-- Checked lazily at withdrawal time — no cron needed.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS temp_unfreeze_until timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.profiles.temp_unfreeze_until IS
  'If set and in the future, the account is temporarily unfrozen for withdrawals even if is_frozen = true. Set by admin for short-window access.';
