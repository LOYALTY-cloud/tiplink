-- Stripe onboarding previously replaced chosen handles with the user's UUID.
-- The original values are not recoverable, so let affected users restore them
-- immediately through Profile without waiting for a handle-change lock.
update public.profiles
set handle_locked_until = null
where handle = user_id::text;