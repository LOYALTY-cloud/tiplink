-- Atomic GREATEST-based payout hold: only extends, never shortens an existing hold.
CREATE OR REPLACE FUNCTION public.set_payout_hold_if_later(
  p_user_id uuid,
  p_hold_until timestamptz
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.profiles
  SET payout_hold_until = GREATEST(payout_hold_until, p_hold_until)
  WHERE user_id = p_user_id;
$$;
