-- Add store restriction detail columns to profiles
-- These are set alongside store_disabled = true by the admin PATCH route.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS store_disabled_until  timestamptz,
  ADD COLUMN IF NOT EXISTS store_disabled_reason text;

COMMENT ON COLUMN public.profiles.store_disabled_until IS
  'When set, the store restriction auto-expires at this timestamp (display only — enforcement uses store_disabled boolean).';
COMMENT ON COLUMN public.profiles.store_disabled_reason IS
  'Admin-entered reason for disabling the store, shown to the creator in the dashboard banner.';

-- Fix theme_unlocks source constraint to include all valid sources
-- 'free_market' (marketplace free unlock) and 'theme_payout' were missing.
ALTER TABLE public.theme_unlocks
  DROP CONSTRAINT IF EXISTS theme_unlocks_source_check;

ALTER TABLE public.theme_unlocks
  ADD CONSTRAINT theme_unlocks_source_check
    CHECK (source IN ('payment', 'promo', 'free_market', 'theme_payout', 'admin'));
