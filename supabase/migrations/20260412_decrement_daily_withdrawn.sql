-- Decrement daily_withdrawn counter (used when a payout fails and balance is reversed).
-- Clamps to 0 so counter never goes negative.
CREATE OR REPLACE FUNCTION public.decrement_daily_withdrawn(uid uuid, amt numeric)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.profiles
  SET daily_withdrawn = GREATEST(COALESCE(daily_withdrawn, 0) - amt, 0)
  WHERE user_id = uid;
$$;
