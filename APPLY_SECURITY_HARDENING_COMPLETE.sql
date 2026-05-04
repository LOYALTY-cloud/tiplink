-- ============================================================
-- SUPABASE SECURITY HARDENING - COMPLETE FIX SCRIPT
-- Run this in Supabase SQL Editor to apply all security fixes
-- ============================================================

-- ==============================================================================
-- STEP 1: REVOKE public RPC access on SECURITY DEFINER functions (Phase 1)
-- ==============================================================================

-- GROUP 1: Financial mutations (critical)
REVOKE EXECUTE ON FUNCTION public.insert_ledger_entry_with_audit(uuid, text, numeric, uuid, jsonb, uuid, text, text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_tip_succeeded(text, uuid, numeric, numeric, numeric, text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_wallet_from_stripe_balance(uuid, numeric, numeric) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_payout_failed_or_canceled(uuid, uuid, text, text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_refund_slice(uuid, uuid, numeric, text, jsonb) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_wallet_balance(uuid) FROM public, anon, authenticated;

-- GROUP 2: Risk/fraud engine
REVOKE EXECUTE ON FUNCTION public.evaluate_risk_rules(uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_risk_score(uuid, int) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_restriction_count(uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.detect_rapid_fire(uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_user_baseline(uuid) FROM public, anon, authenticated;

-- GROUP 3: Wallet manipulation (CRITICAL)
-- ensure_wallet_row: creates wallet rows for any user if called directly
REVOKE EXECUTE ON FUNCTION public.ensure_wallet_row(uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_payout_paid(uuid, uuid, numeric, text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, int, int) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limits() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_daily_withdrawn(uuid, numeric) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_daily_withdrawn() FROM public, anon, authenticated;

-- Defensive hardening for potential overloaded signatures found by Security Advisor.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('process_payout_paid', 'decrement_daily_withdrawals')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM public, anon, authenticated', r.nspname, r.proname, r.args);
  END LOOP;
END
$$;

-- GROUP 4: Admin/cron background ops
REVOKE EXECUTE ON FUNCTION public.mark_stale_admins_offline() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.close_stale_support_sessions() FROM public, anon, authenticated;

-- GROUP 5: Trigger functions (defense-in-depth)
REVOKE EXECUTE ON FUNCTION public.transactions_ledger_prevent_update_delete() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_session_last_message() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.detect_override_spam() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;

-- GROUP 6: Theme/store functions
REVOKE EXECUTE ON FUNCTION public.purchase_theme_with_balance(uuid, text, numeric) FROM public, anon, authenticated;

-- ==============================================================================
-- STEP 2: REVOKE public RPC access - PHASE 2 (newly added functions)
-- ==============================================================================

-- GROUP 1: Snapshot/analytics
REVOKE EXECUTE ON FUNCTION public.snapshot_wallet_balances() FROM public, anon, authenticated;

-- GROUP 2: Payout hold manipulation (CRITICAL)
REVOKE EXECUTE ON FUNCTION public.set_payout_hold_if_later(uuid, timestamptz) FROM public, anon, authenticated;

-- GROUP 3: Archive/admin functions
REVOKE EXECUTE ON FUNCTION public.archive_old_admin_overrides(integer) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_archived_refund_requests_to_archive(integer, integer) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_closed_resolved_tickets_to_archive(integer, integer) FROM public, anon, authenticated;

-- GROUP 4: Activity counts (read-only but restricted for consistency)
REVOKE EXECUTE ON FUNCTION public.get_override_user_activity_counts(uuid[]) FROM public, anon, authenticated;

-- GROUP 5: Limit enforcement triggers
REVOKE EXECUTE ON FUNCTION public.limit_elite_creators() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.block_new_elite_applications() FROM public, anon, authenticated;

-- ==============================================================================
-- STEP 3: FIX MUTABLE SEARCH_PATH on all critical functions
-- ==============================================================================

-- Phase 1 hardening (already has SET search_path)
ALTER FUNCTION public.get_tip_receipt(text) SET search_path = public;

-- Phase 2 archive/admin functions
ALTER FUNCTION public.archive_old_admin_overrides(integer) SET search_path = public;
ALTER FUNCTION public.move_archived_refund_requests_to_archive(integer, integer) SET search_path = 'public';
ALTER FUNCTION public.move_closed_resolved_tickets_to_archive(integer, integer) SET search_path = 'public';

-- ==============================================================================
-- STEP 4: FIX STORAGE BUCKET PUBLIC ACCESS
-- ==============================================================================

-- Disable public listing on sensitive buckets
UPDATE storage.buckets
SET public = false
WHERE id IN ('avatars', 'themes', 'receipts')
  AND public = true;

-- Note: storage.objects already has RLS enabled by default in Supabase.
-- No need to ALTER TABLE — it's managed by Supabase infrastructure.

-- ==============================================================================
-- STEP 5: VERIFICATION QUERIES
-- Run these to confirm security hardening is applied
-- ==============================================================================

-- Check 1: Verify storage.buckets public setting
SELECT
  id,
  name,
  public,
  created_at
FROM storage.buckets
WHERE id IN ('avatars', 'themes', 'receipts')
ORDER BY id;

-- Check 2: List all SECURITY DEFINER functions and their search_path
-- (Should show search_path is set for all)
SELECT
  n.nspname,
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  prosecdef AS is_security_definer,
  proconfig AS search_path_config
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prosecdef = true
ORDER BY p.proname;

-- Check 3: Confirm critical functions are revoked
-- Run this query and verify no rows return for critical financial functions
SELECT
  p.proname,
  n.nspname,
  array_agg(a.rolname) AS remaining_access
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
JOIN pg_auth_members m ON p.proowner = m.roleid
JOIN pg_roles a ON m.member = a.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'insert_ledger_entry_with_audit',
    'process_tip_succeeded',
    'process_payout_paid',
    'sync_wallet_from_stripe_balance',
    'ensure_wallet_row',
    'set_payout_hold_if_later',
    'check_rate_limit',
    'evaluate_risk_rules'
  )
  AND a.rolname IN ('authenticated', 'anon', 'public')
GROUP BY p.proname, n.nspname
ORDER BY p.proname;

-- Check 4: List functions that are INTENTIONALLY still accessible
-- (These should be is_admin and get_tip_receipt)
SELECT
  p.proname,
  n.nspname,
  array_agg(a.rolname) AS who_can_access
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
JOIN pg_auth_members m ON p.proowner = m.roleid
JOIN pg_roles a ON m.member = a.oid
WHERE n.nspname = 'public'
  AND p.proname IN ('is_admin', 'get_tip_receipt')
  AND a.rolname IN ('authenticated', 'anon')
GROUP BY p.proname, n.nspname
ORDER BY p.proname;
