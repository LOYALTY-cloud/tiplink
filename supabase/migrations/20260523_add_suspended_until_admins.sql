-- Add suspended_until for time-based auto-unlock on suspended admins
ALTER TABLE public.admins
ADD COLUMN IF NOT EXISTS suspended_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_admins_suspended_until
  ON public.admins(suspended_until) WHERE suspended_until IS NOT NULL;
