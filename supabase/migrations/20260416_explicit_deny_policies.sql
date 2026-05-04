-- Explicit deny-all policies for service-role-only tables.
-- These tables already have RLS + FORCE enabled with zero policies (implicit deny),
-- but adding explicit USING(false) documents intent and satisfies Security Advisor.

-- daily_snapshots — written by cron/backend only
CREATE POLICY "deny_all_daily_snapshots"
  ON public.daily_snapshots
  FOR ALL
  USING (false);

-- support_logs — written by API routes (service role) only
CREATE POLICY "deny_all_support_logs"
  ON public.support_logs
  FOR ALL
  USING (false);

-- wallet_biometrics — managed by service role only
CREATE POLICY "deny_all_wallet_biometrics"
  ON public.wallet_biometrics
  FOR ALL
  USING (false);

-- wallet_locks — managed by service role only
CREATE POLICY "deny_all_wallet_locks"
  ON public.wallet_locks
  FOR ALL
  USING (false);

-- wallet_otp — managed by service role only
CREATE POLICY "deny_all_wallet_otp"
  ON public.wallet_otp
  FOR ALL
  USING (false);
