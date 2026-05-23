-- Allow service_role to delete from transactions_ledger.
-- The immutable trigger was blocking all deletes, including ON DELETE CASCADE
-- from the profiles table, which caused account deletion to fail.
-- All other roles (including authenticated users) remain blocked.

CREATE OR REPLACE FUNCTION public.transactions_ledger_prevent_update_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Service role is allowed to delete (e.g., during user account deletion cleanup)
  IF tg_op = 'DELETE' AND current_role = 'service_role' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'transactions_ledger is immutable: % operation not allowed', tg_op;
END;
$$;
