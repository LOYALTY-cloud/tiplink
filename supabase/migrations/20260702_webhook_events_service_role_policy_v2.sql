-- Idempotent re-application of service_role write policies for webhook tables.
--
-- Root cause: markProcessed and upsertFailedWebhookEvent both fail with
-- "new row violates row-level security policy" when the Supabase client is
-- accidentally initialised with a publishable (anon-level) key instead of the
-- service role key. FORCE ROW LEVEL SECURITY blocks the anon role.
--
-- Even if the June-21 migration was applied, this re-creates the policies
-- idempotently so a future DROP POLICY or misconfigured migration cannot
-- silently break webhook processing again.
--
-- Code-level fix: assertServerKeyLooksPrivileged now also rejects
-- sb_publishable_* keys so misconfigured Vercel env vars throw loudly.

-- ── stripe_webhook_events ────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stripe_webhook_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON public.stripe_webhook_events;
CREATE POLICY "service_role_all"
  ON public.stripe_webhook_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── stripe_failed_webhook_events ─────────────────────────────────────────────
ALTER TABLE IF EXISTS public.stripe_failed_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stripe_failed_webhook_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON public.stripe_failed_webhook_events;
CREATE POLICY "service_role_all"
  ON public.stripe_failed_webhook_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
