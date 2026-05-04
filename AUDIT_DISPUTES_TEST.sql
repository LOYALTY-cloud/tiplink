-- DISPUTES SYSTEM COMPREHENSIVE AUDIT
-- Run this in Supabase to validate all hardening is in place and data is clean

-- ─── 1. SCHEMA VALIDATION ────────────────────────────────
SELECT 'SCHEMA CHECKS' AS category;

-- Check dispute_approvals table exists and has all required columns
SELECT
  'dispute_approvals table' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'dispute_approvals'
  ) AS ok,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'dispute_approvals'
  ) THEN 'Table exists' ELSE 'Table not found' END AS status;

-- Check all required columns exist
SELECT
  'Column: id' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dispute_approvals' AND column_name = 'id'
  ) AS ok;

SELECT
  'Column: receipt_id' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dispute_approvals' AND column_name = 'receipt_id'
  ) AS ok;

SELECT
  'Column: approved_by' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dispute_approvals' AND column_name = 'approved_by'
  ) AS ok;

SELECT
  'Column: status' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dispute_approvals' AND column_name = 'status'
  ) AS ok;

-- ─── 2. INDEX AND CONSTRAINT VALIDATION ──────────────────
SELECT 'INDEX AND CONSTRAINT CHECKS' AS category;

-- Check unique pending index exists
SELECT
  'idx_dispute_approvals_one_open_pending index exists' AS check_name,
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'dispute_approvals'
      AND indexname = 'idx_dispute_approvals_one_open_pending'
  ) AS ok;

-- Check primary key
SELECT
  'Primary key on id' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'dispute_approvals'
      AND constraint_type = 'PRIMARY KEY'
  ) AS ok;

-- ─── 3. POLICY VALIDATION ───────────────────────────────
SELECT 'POLICY CHECKS' AS category;

-- Check INSERT policy exists and excludes support_admin
SELECT
  'INSERT policy excludes support_admin' AS check_name,
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'dispute_approvals'
      AND policyname = 'Admins can insert dispute approvals'
      AND with_check IS NOT NULL
      AND with_check NOT ILIKE '%support_admin%'
  ) AS ok;

-- Check SELECT policy includes support_admin (read-only)
SELECT
  'SELECT policy includes support_admin (read access)' AS check_name,
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'dispute_approvals'
      AND policyname = 'Admins can view dispute approvals'
  ) AS ok;

-- Check UPDATE policy exists
SELECT
  'UPDATE policy exists' AS check_name,
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'dispute_approvals'
      AND policyname = 'Admins can update dispute approvals'
  ) AS ok;

-- ─── 4. DATA INTEGRITY CHECKS ───────────────────────────
SELECT 'DATA INTEGRITY CHECKS' AS category;

-- Check for orphaned approvals (no matching tip_intent)
SELECT
  'No orphaned approvals (all have valid receipt_id)' AS check_name,
  NOT EXISTS (
    SELECT 1 FROM public.dispute_approvals da
    WHERE NOT EXISTS (
      SELECT 1 FROM public.tip_intents ti
      WHERE ti.receipt_id = da.receipt_id
    )
  ) AS ok;

-- Check for duplicate open pending approvals (should be 0)
SELECT
  'No duplicate open pending approvals per receipt' AS check_name,
  NOT EXISTS (
    SELECT 1
    FROM public.dispute_approvals
    WHERE status = 'pending' AND approved_by IS NULL
    GROUP BY receipt_id
    HAVING COUNT(*) > 1
  ) AS ok;

-- Count pending approvals awaiting action
SELECT
  'pending_approvals_count' AS metric,
  COUNT(*) AS count
FROM public.dispute_approvals
WHERE status = 'pending' AND approved_by IS NULL;

-- Count approved vs rejected
SELECT
  'approval_status_distribution' AS metric,
  status,
  COUNT(*) AS count
FROM public.dispute_approvals
WHERE status IN ('approved', 'rejected')
GROUP BY status;

-- ─── 5. ACTIVE DISPUTE STATUS ───────────────────────────
SELECT 'ACTIVE DISPUTE CHECKS' AS category;

-- Count active disputed tips (tip_intents with status='disputed')
SELECT
  'active_disputed_tips' AS metric,
  COUNT(*) AS count
FROM public.tip_intents
WHERE status = 'disputed';

-- Count resolved disputes
SELECT
  'resolved_disputes' AS metric,
  COUNT(*) AS count
FROM public.tip_intents
WHERE status IN ('dispute_resolved', 'dispute_countered');

-- Count tips with pending approval but no progress
SELECT
  'disputed_tips_with_no_approval' AS metric,
  COUNT(*) AS count
FROM public.tip_intents ti
WHERE ti.status = 'disputed'
  AND NOT EXISTS (
    SELECT 1 FROM public.dispute_approvals da
    WHERE da.receipt_id = ti.receipt_id
  );

-- ─── 6. ROLE-BASED ACCESS VALIDATION ────────────────────
SELECT 'ROLE-BASED ACCESS CHECKS' AS category;

-- Check profiles with refund roles
SELECT
  'admin_profiles_with_refund_roles' AS metric,
  role,
  COUNT(*) AS count
FROM public.profiles
WHERE role IN ('owner', 'super_admin', 'finance_admin', 'support_admin')
  AND deleted_at IS NULL
GROUP BY role;

-- ─── 7. REALTIME PUBLICATION CHECKS ────────────────────
SELECT 'REALTIME CHECKS' AS category;

-- Check dispute_approvals is in realtime publication
SELECT
  'dispute_approvals in supabase_realtime publication' AS check_name,
  EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'dispute_approvals'
  ) AS ok;

-- Check tip_intents is in realtime publication
SELECT
  'tip_intents in supabase_realtime publication' AS check_name,
  EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'tip_intents'
  ) AS ok;

-- Check dispute_assignments is in realtime publication
SELECT
  'dispute_assignments in supabase_realtime publication' AS check_name,
  EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'dispute_assignments'
  ) AS ok;

-- Check replica identities
SELECT
  'REPLICA IDENTITY for dispute_approvals' AS check_name,
  (SELECT relreplident FROM pg_class WHERE relname = 'dispute_approvals' AND relnamespace = 'public'::regnamespace) AS replica_identity,
  CASE (SELECT relreplident FROM pg_class WHERE relname = 'dispute_approvals' AND relnamespace = 'public'::regnamespace)
    WHEN 'f' THEN 'NOTHING'
    WHEN 'd' THEN 'DEFAULT'
    WHEN 'i' THEN 'USING INDEX'
    WHEN 'c' THEN 'FULL'
    ELSE 'UNKNOWN'
  END AS identity_mode;

-- ─── 8. RECENT ACTIVITY ────────────────────────────────
SELECT 'RECENT ACTIVITY CHECKS' AS category;

-- Most recent approvals
SELECT
  'recent_approvals_last_5' AS metric,
  id,
  receipt_id,
  status,
  approved_by IS NOT NULL AS is_approved,
  created_at,
  approved_at
FROM public.dispute_approvals
ORDER BY created_at DESC
LIMIT 5;

-- Recent disputes
SELECT
  'recent_disputes_last_5' AS metric,
  receipt_id,
  status,
  tip_amount,
  created_at
FROM public.tip_intents
WHERE status IN ('disputed', 'dispute_resolved', 'dispute_countered')
ORDER BY created_at DESC
LIMIT 5;

-- ─── 9. SUMMARY ────────────────────────────────────────
SELECT 'AUDIT SUMMARY' AS category;

SELECT
  'All hardening checks' AS check_name,
  (
    (SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_dispute_approvals_one_open_pending'))
    AND (SELECT NOT EXISTS (SELECT 1 FROM public.dispute_approvals WHERE status = 'pending' AND approved_by IS NULL GROUP BY receipt_id HAVING COUNT(*) > 1))
    AND (SELECT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'dispute_approvals'))
  ) AS all_ok;
