-- Add store_disabled flag to profiles.
-- When true, the creator's store is hidden from public and store API returns 403.
-- Does NOT affect account status — scoped restriction for store only.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS store_disabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.store_disabled IS
  'Admin-set flag. When true, the creator''s store is taken offline without suspending the full account.';
