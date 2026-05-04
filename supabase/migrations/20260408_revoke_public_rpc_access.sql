-- ============================================================
-- SECURITY HARDENING: REVOKE public RPC access on SECURITY DEFINER functions
-- (idempotent — safe to re-run)
--
-- Problem:
--   By default PostgreSQL grants EXECUTE to PUBLIC on all functions.
--   Combined with SECURITY DEFINER, this means ANY authenticated
--   Supabase user can call these functions via PostgREST RPC and
--   execute them with the function owner's (postgres) privileges.
--
-- Fix:
--   REVOKE EXECUTE from public/anon/authenticated on all functions
--   that should ONLY be called by:
--     • service_role (backend API routes via supabaseAdmin)
--     • triggers (internally by PostgreSQL)
--     • cron jobs (via service_role)
--
--   The service_role bypasses these restrictions automatically,
--   so backend code continues to work unchanged.
--
-- NOT revoked:
--   • is_admin()            — used in RLS policies, needs authenticated
--   • get_tip_receipt(text)  — public receipt page, needs anon + authenticated
-- ============================================================

-- ════════════════════════════════════════
-- GROUP 1: CRITICAL — Financial mutations
-- These can create money, move funds, or
-- forge transactions if called by a user.
-- ════════════════════════════════════════

-- insert_ledger_entry_with_audit: inserts arbitrary ledger entries
REVOKE EXECUTE ON FUNCTION public.insert_ledger_entry_with_audit(uuid, text, numeric, uuid, jsonb, uuid, text, text) FROM public, anon, authenticated;

-- process_tip_succeeded: credits pending wallet + creates ledger entry
REVOKE EXECUTE ON FUNCTION public.process_tip_succeeded(text, uuid, numeric, numeric, numeric, text) FROM public, anon, authenticated;

-- sync_wallet_from_stripe_balance: overwrites wallet balances
REVOKE EXECUTE ON FUNCTION public.sync_wallet_from_stripe_balance(uuid, numeric, numeric) FROM public, anon, authenticated;

-- process_payout_failed_or_canceled: marks withdrawals as failed
REVOKE EXECUTE ON FUNCTION public.process_payout_failed_or_canceled(uuid, uuid, text, text) FROM public, anon, authenticated;

-- apply_refund_slice: processes refunds (ledger debit + status update)
REVOKE EXECUTE ON FUNCTION public.apply_refund_slice(uuid, uuid, numeric, text, jsonb) FROM public, anon, authenticated;

-- recalculate_wallet_balance: recalculates wallet from ledger
REVOKE EXECUTE ON FUNCTION public.recalculate_wallet_balance(uuid) FROM public, anon, authenticated;

-- ════════════════════════════════════════
-- GROUP 2: CRITICAL — Risk / fraud engine
-- Can restrict accounts or manipulate
-- risk scores if called by a user.
-- ════════════════════════════════════════

-- evaluate_risk_rules: auto-restricts accounts based on risk rules
REVOKE EXECUTE ON FUNCTION public.evaluate_risk_rules(uuid) FROM public, anon, authenticated;

-- increment_risk_score: modifies a user's risk score (negative delta = exploit)
REVOKE EXECUTE ON FUNCTION public.increment_risk_score(uuid, int) FROM public, anon, authenticated;

-- increment_restriction_count: inflates restriction count on any profile
REVOKE EXECUTE ON FUNCTION public.increment_restriction_count(uuid) FROM public, anon, authenticated;

-- detect_rapid_fire: exposes withdrawal patterns of any user
REVOKE EXECUTE ON FUNCTION public.detect_rapid_fire(uuid) FROM public, anon, authenticated;

-- refresh_user_baseline: recalculates behavioral baselines
REVOKE EXECUTE ON FUNCTION public.refresh_user_baseline(uuid) FROM public, anon, authenticated;

-- ════════════════════════════════════════
-- GROUP 3: Rate limiting / withdrawal ops
-- Can manipulate rate limits or reset
-- daily counters if called by a user.
-- ════════════════════════════════════════

-- check_rate_limit: manipulates rate limit counters for any key
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, int, int) FROM public, anon, authenticated;

-- cleanup_rate_limits: deletes expired rate limit rows (cron-only)
REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limits() FROM public, anon, authenticated;

-- increment_daily_withdrawn: increases daily withdrawal counter
REVOKE EXECUTE ON FUNCTION public.increment_daily_withdrawn(uuid, numeric) FROM public, anon, authenticated;

-- reset_daily_withdrawn: resets all daily withdrawal counters (cron-only)
REVOKE EXECUTE ON FUNCTION public.reset_daily_withdrawn() FROM public, anon, authenticated;

-- ════════════════════════════════════════
-- GROUP 4: Admin / cron background ops
-- Should only run via service_role / cron
-- ════════════════════════════════════════

-- mark_stale_admins_offline: cron job for admin presence
REVOKE EXECUTE ON FUNCTION public.mark_stale_admins_offline() FROM public, anon, authenticated;

-- close_stale_support_sessions: cron job for support cleanup
REVOKE EXECUTE ON FUNCTION public.close_stale_support_sessions() FROM public, anon, authenticated;

-- ════════════════════════════════════════
-- GROUP 5: Trigger functions
-- Already non-callable via RPC (no args match PostgREST),
-- but REVOKE for defense-in-depth.
-- ════════════════════════════════════════

-- transactions_ledger_prevent_update_delete: immutability trigger
REVOKE EXECUTE ON FUNCTION public.transactions_ledger_prevent_update_delete() FROM public, anon, authenticated;

-- update_session_last_message: support session trigger
REVOKE EXECUTE ON FUNCTION public.update_session_last_message() FROM public, anon, authenticated;

-- detect_override_spam: admin action trigger
REVOKE EXECUTE ON FUNCTION public.detect_override_spam() FROM public, anon, authenticated;

-- handle_new_user: auth.users trigger
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;

-- ════════════════════════════════════════
-- GROUP 6: Fix get_tip_receipt search_path
-- This function is SECURITY DEFINER and
-- callable by anon — must have search_path
-- locked to prevent search_path injection.
-- ════════════════════════════════════════

ALTER FUNCTION public.get_tip_receipt(text) SET search_path = public;

-- ════════════════════════════════════════
-- KEPT ACCESSIBLE (intentionally):
--
-- is_admin()
--   → Used in RLS policies, must be callable by authenticated
--   → Already has SET search_path = public
--
-- get_tip_receipt(text)
--   → Public receipt page, needs anon + authenticated
--   → Now has SET search_path = public (fixed above)
--
-- purchase_theme_with_balance(uuid, text, numeric)
--   → Called by backend API only (supabaseAdmin)
--   → Accepts arbitrary p_user_id — a user could spend another's wallet
--   → REVOKED: service_role bypasses, so backend still works
REVOKE EXECUTE ON FUNCTION public.purchase_theme_with_balance(uuid, text, numeric) FROM public, anon, authenticated;
-- ════════════════════════════════════════
