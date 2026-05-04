-- Atomic creator progress increment used by handleCreatorProgress.
-- Uses SQL-level increment (total_sales + 1, total_revenue + p_earnings)
-- to eliminate read-modify-write races when the approve-theme-sales cron
-- processes multiple sales concurrently.
-- Returns the updated total_sales so the caller can determine tier changes.

CREATE OR REPLACE FUNCTION increment_creator_progress(
  p_user_id uuid,
  p_earnings numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_sales bigint;
BEGIN
  UPDATE profiles
  SET
    total_sales   = COALESCE(total_sales, 0) + 1,
    total_revenue = COALESCE(total_revenue, 0) + p_earnings,
    updated_at    = now()
  WHERE user_id = p_user_id
  RETURNING total_sales INTO v_new_sales;

  RETURN jsonb_build_object('total_sales', v_new_sales);
END;
$$;

-- Only the service role should call this function.
REVOKE EXECUTE ON FUNCTION increment_creator_progress(uuid, numeric) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION increment_creator_progress(uuid, numeric) TO service_role;
