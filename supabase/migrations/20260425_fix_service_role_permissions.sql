-- Fix: deny-all RLS policies were blocking service_role on internal tables.
-- The policies had no TO clause, which applies to ALL roles.
-- In Supabase, service_role uses the PostgREST API path and IS subject to
-- RLS policies unless BYPASSRLS is set at the DB level OR an allow policy exists.
-- Solution: re-scope deny policies to authenticated + anon only, and add
-- explicit service_role allow policies for each internal-only table.

-- ── wallet_otp ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "deny_all_wallet_otp" ON public.wallet_otp;

CREATE POLICY "deny_client_wallet_otp"
  ON public.wallet_otp
  FOR ALL
  TO authenticated, anon
  USING (false);

CREATE POLICY "allow_service_role_wallet_otp"
  ON public.wallet_otp
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── wallet_biometrics ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "deny_all_wallet_biometrics" ON public.wallet_biometrics;

CREATE POLICY "deny_client_wallet_biometrics"
  ON public.wallet_biometrics
  FOR ALL
  TO authenticated, anon
  USING (false);

CREATE POLICY "allow_service_role_wallet_biometrics"
  ON public.wallet_biometrics
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── wallet_locks ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "deny_all_wallet_locks" ON public.wallet_locks;

CREATE POLICY "deny_client_wallet_locks"
  ON public.wallet_locks
  FOR ALL
  TO authenticated, anon
  USING (false);

CREATE POLICY "allow_service_role_wallet_locks"
  ON public.wallet_locks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── daily_snapshots ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "deny_all_daily_snapshots" ON public.daily_snapshots;

CREATE POLICY "deny_client_daily_snapshots"
  ON public.daily_snapshots
  FOR ALL
  TO authenticated, anon
  USING (false);

CREATE POLICY "allow_service_role_daily_snapshots"
  ON public.daily_snapshots
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── support_logs ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "deny_all_support_logs" ON public.support_logs;

CREATE POLICY "deny_client_support_logs"
  ON public.support_logs
  FOR ALL
  TO authenticated, anon
  USING (false);

CREATE POLICY "allow_service_role_support_logs"
  ON public.support_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── wallet_biometric_challenges ──────────────────────────────────────────────
-- Table may not exist in all environments; guard with a DO block.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'wallet_biometric_challenges'
  ) THEN
    DROP POLICY IF EXISTS "deny_all_wallet_biometric_challenges" ON public.wallet_biometric_challenges;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename  = 'wallet_biometric_challenges'
        AND policyname = 'deny_client_wallet_biometric_challenges'
    ) THEN
      CREATE POLICY "deny_client_wallet_biometric_challenges"
        ON public.wallet_biometric_challenges
        FOR ALL
        TO authenticated, anon
        USING (false);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename  = 'wallet_biometric_challenges'
        AND policyname = 'allow_service_role_wallet_biometric_challenges'
    ) THEN
      CREATE POLICY "allow_service_role_wallet_biometric_challenges"
        ON public.wallet_biometric_challenges
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);
    END IF;
  END IF;
END $$;

-- ── check_rate_limit / cleanup_rate_limits ───────────────────────────────────
-- These were revoked from public/anon/authenticated but never explicitly granted
-- to service_role. API routes (which run as service_role) need them.
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limits() TO service_role;
