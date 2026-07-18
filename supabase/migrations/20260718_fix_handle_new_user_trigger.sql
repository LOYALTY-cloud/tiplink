-- Fix: DB trigger no longer uses UUID as the handle placeholder.
-- Instead it derives a readable handle from the email prefix.
--
-- Why: if the signup API's profile upsert ever fails before setting the
-- real handle, the user ends up with a UUID as their public @handle.
-- Deriving from the email gives a legible fallback users can change.
--
-- RUN THIS IN THE SUPABASE SQL EDITOR.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  derived_handle TEXT;
  attempt        INT := 0;
BEGIN
  -- Derive a handle from the email prefix (a-z, 0-9, _ only, 3-30 chars)
  derived_handle := lower(
    regexp_replace(split_part(COALESCE(new.email, ''), '@', 1), '[^a-z0-9_]', '', 'g')
  );
  derived_handle := left(derived_handle, 28);

  -- Fall back to 'user' + first 8 hex chars of the UUID if email prefix is too short
  IF length(derived_handle) < 3 THEN
    derived_handle := 'user' || left(replace(new.id::text, '-', ''), 8);
  END IF;

  -- Add a 4-digit random suffix if the derived handle is already taken.
  -- Loop max 10 times (astronomically sufficient; avoids infinite loops).
  WHILE attempt < 10 AND EXISTS (
    SELECT 1 FROM public.profiles WHERE lower(handle) = lower(derived_handle)
  ) LOOP
    attempt        := attempt + 1;
    derived_handle := left(derived_handle, 24) || (1000 + floor(random() * 9000)::int)::text;
  END LOOP;

  -- Create profile row first (other tables FK to this)
  INSERT INTO public.profiles (user_id, handle, email)
  VALUES (new.id, derived_handle, new.email)
  ON CONFLICT (user_id) DO NOTHING;

  -- Create wallets row
  INSERT INTO public.wallets (user_id, balance, available, pending)
  VALUES (new.id, 0, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- Create user_settings row
  INSERT INTO public.user_settings (user_id, notify_tips, notify_payouts, notify_security)
  VALUES (new.id, true, true, true)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;
END;
$$;

-- Trigger is already attached; replacing the function is sufficient.
-- Recreating here for completeness / if it was ever dropped.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
