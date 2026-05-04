-- READ-ONLY unified verification for:
-- 1) overrides retention + archive setup
-- 2) disputes realtime publication setup

-- =============================
-- OVERRIDES RETENTION + ARCHIVE
-- =============================
SELECT
  'admin_overrides table' AS check_name,
  to_regclass('public.admin_overrides') IS NOT NULL AS ok;

SELECT
  'admin_overrides_archive table' AS check_name,
  to_regclass('public.admin_overrides_archive') IS NOT NULL AS ok;

SELECT
  'admin_overrides.is_archived column' AS check_name,
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'admin_overrides'
      AND column_name = 'is_archived'
  ) AS ok;

SELECT
  'admin_overrides replica identity full' AS check_name,
  (SELECT relreplident = 'f' FROM pg_class WHERE oid = 'public.admin_overrides'::regclass) AS ok;

SELECT
  'archive_old_admin_overrides function' AS check_name,
  EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'archive_old_admin_overrides'
  ) AS ok;

SELECT
  'move_archived_admin_overrides_to_archive function' AS check_name,
  EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'move_archived_admin_overrides_to_archive'
  ) AS ok;

SELECT
  'get_override_user_activity_counts function' AS check_name,
  EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_override_user_activity_counts'
  ) AS ok;

SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_admin_overrides_active_created_at_desc',
    'idx_admin_overrides_archived_created_at_desc',
    'idx_admin_overrides_active_type_created_at_desc',
    'idx_admin_overrides_archived_type_created_at_desc',
    'idx_admin_overrides_archive_created_at_desc',
    'idx_admin_overrides_archive_type_created_at_desc',
    'idx_admin_overrides_archive_target_created_at_desc'
  )
ORDER BY indexname;

SELECT
  'admin_overrides_archive RLS enabled' AS check_name,
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.admin_overrides_archive'::regclass) AS ok;

SELECT
  'archive service_role policy present' AS check_name,
  EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_overrides_archive'
      AND policyname = 'Service role full access on admin_overrides_archive'
  ) AS ok;

-- =============================
-- DISPUTES REALTIME
-- =============================
SELECT
  'tip_intents in realtime publication' AS check_name,
  EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'tip_intents'
  ) AS ok;

SELECT
  'dispute_approvals in realtime publication' AS check_name,
  EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'dispute_approvals'
  ) AS ok;

SELECT
  'dispute_assignments in realtime publication' AS check_name,
  EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'dispute_assignments'
  ) AS ok;

SELECT
  'tip_intents replica identity full' AS check_name,
  (SELECT relreplident = 'f' FROM pg_class WHERE oid = 'public.tip_intents'::regclass) AS ok;

SELECT
  'dispute_approvals replica identity full' AS check_name,
  (SELECT relreplident = 'f' FROM pg_class WHERE oid = 'public.dispute_approvals'::regclass) AS ok;

SELECT
  'dispute_assignments replica identity full' AS check_name,
  (SELECT relreplident = 'f' FROM pg_class WHERE oid = 'public.dispute_assignments'::regclass) AS ok;
