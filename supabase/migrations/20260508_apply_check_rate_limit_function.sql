-- ============================================================
-- Apply check_rate_limit function to production
-- (idempotent — safe to re-run)
--
-- The rate_limits table and check_rate_limit function were
-- defined in 20260328_rate_limits.sql but never applied to
-- the production database, causing all rate-limit checks to
-- error and (previously) fail closed — blocking all logins.
-- ============================================================

-- Rate limiting table
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key       text        PRIMARY KEY,
  count     int         NOT NULL DEFAULT 0,
  reset_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON public.rate_limits(reset_at);

-- Atomic rate limit check: returns TRUE if allowed, FALSE if blocked.
-- If the window has expired, resets the counter.
-- Uses INSERT ... ON CONFLICT to avoid read-then-write race conditions.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key        text,
  p_limit      int,
  p_window_sec int
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count    int;
  v_reset_at timestamptz;
  v_now      timestamptz := now();
BEGIN
  INSERT INTO public.rate_limits (key, count, reset_at)
  VALUES (p_key, 1, v_now + (p_window_sec || ' seconds')::interval)
  ON CONFLICT (key) DO UPDATE
    SET
      count = CASE
        WHEN rate_limits.reset_at < v_now THEN 1
        ELSE rate_limits.count + 1
      END,
      reset_at = CASE
        WHEN rate_limits.reset_at < v_now
          THEN v_now + (p_window_sec || ' seconds')::interval
        ELSE rate_limits.reset_at
      END
  RETURNING count, reset_at INTO v_count, v_reset_at;

  RETURN v_count <= p_limit;
END;
$$;

-- Cleanup: remove expired entries (call via cron or manually)
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.rate_limits WHERE reset_at < now();
END;
$$;

-- check_rate_limit is called by the backend service role only (supabaseAdmin).
-- Revoke from anon/authenticated — no client should call this directly.
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, int, int)  FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limits()             FROM public, anon, authenticated;

-- RLS on the rate_limits table: only service_role reads/writes
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'rate_limits'
      AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON public.rate_limits
      AS PERMISSIVE FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;
