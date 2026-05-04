-- ============================================================
-- SECURITY HARDENING: Phase 2 — Additional RPC revocations
-- and search_path fixes for newly added functions
-- (idempotent — safe to re-run)
--
-- This migration addresses functions added after the initial
-- 20260408_revoke_public_rpc_access.sql migration.
-- ============================================================

-- ════════════════════════════════════════
-- GROUP 1: Snapshot/analytics functions
-- Should only be called via cron jobs or backend
-- ════════════════════════════════════════

-- snapshot_wallet_balances: exposes all wallet balances (analytics)
-- Only backend cron should call this via service_role
REVOKE EXECUTE ON FUNCTION public.snapshot_wallet_balances() FROM public, anon, authenticated;

-- ════════════════════════════════════════
-- GROUP 2: Wallet manipulation
-- CRITICAL: Can create wallet rows for arbitrary users
-- Only backend should call this via triggers/internal functions
-- ════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.ensure_wallet_row(uuid) FROM public, anon, authenticated;

-- process_payout_paid: marks withdrawal as paid + mutates money state
-- Must never be callable by anon/authenticated via RPC
REVOKE EXECUTE ON FUNCTION public.process_payout_paid(uuid, uuid, numeric, text) FROM public, anon, authenticated;
-- Revoke execution from users

-- Defensive hardening for potential overloaded signatures found by Security Advisor.
-- This revokes by function name for any matching function in public schema and is safe to re-run.
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
REVOKE EXECUTE ON FUNCTION public.set_payout_hold_if_later(uuid, timestamptz) FROM public, anon, authenticated;

-- ════════════════════════════════════════
-- GROUP 3: Archive/admin functions
-- Should only run via cron or backend
-- ════════════════════════════════════════

-- archive_old_admin_overrides: marks old overrides as archived
-- Need to ensure search_path is set
ALTER FUNCTION public.archive_old_admin_overrides(integer)
SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.archive_old_admin_overrides(integer) FROM public, anon, authenticated;

-- ════════════════════════════════════════
-- GROUP 4: Activity count queries
-- These are read-only, but should be restricted
-- to service_role only for consistency & monitoring
-- ════════════════════════════════════════

-- get_override_user_activity_counts: queries dispute/refund Activity
-- This is read-only but reveals patterns, restrict for consistency
REVOKE EXECUTE ON FUNCTION public.get_override_user_activity_counts(uuid[]) FROM public, anon, authenticated;

-- ════════════════════════════════════════
-- GROUP 5: Storage bucket security
-- Disable public listing on sensitive buckets
-- ════════════════════════════════════════

-- Update storage.buckets to disable public object listing
-- Allow public read, deny public list
UPDATE storage.buckets
SET public = false
WHERE id IN ('avatars', 'themes', 'receipts')
  AND public = true;

-- Note: Storage RLS policies are managed by Supabase and already enforce
-- fine-grained access control. We don't need to create additional policies
-- for storage.objects as they conflict with Supabase's built-in policies.

-- ════════════════════════════════════════
-- GROUP 6: Trigger functions (defense-in-depth)
-- Already non-callable in PostgREST, but
-- revoke for completeness
-- ════════════════════════════════════════

-- Thresholds/limit enforcement triggers
REVOKE EXECUTE ON FUNCTION public.limit_elite_creators() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.block_new_elite_applications() FROM public, anon, authenticated;

-- Admin override spam detection
REVOKE EXECUTE ON FUNCTION public.detect_override_spam() FROM public, anon, authenticated;

-- ════════════════════════════════════════
-- GROUP 7: Admin helper functions
-- These may be used in admin RLS policies
-- but should NOT be callable directly
-- ════════════════════════════════════════

-- is_admin() is INTENTIONALLY kept accessible
-- (used in RLS policies for admin gate checks)
-- Already has SET search_path = public ✓
-- No revoke needed

-- ════════════════════════════════════════
-- VERIFICATION: Ensure all SECURITY DEFINER
-- functions have SET search_path
-- ════════════════════════════════════════

-- These should all have search_path set now:
--   ✓ is_admin() — SET search_path = public
--   ✓ get_tip_receipt() — SET search_path = public
--   ✓ set_payout_hold_if_later() — SET search_path = ''
--   ✓ snapshot_wallet_balances() — SET search_path = public
-- 
-- All others were hardened in 20260401_security_hardening_search_path.sql
