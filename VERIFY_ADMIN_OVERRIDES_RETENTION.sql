-- READ-ONLY verification checks for overrides retention/realtime setup.
-- Run in Supabase SQL editor after applying migrations/scripts.

-- 1) Core tables present
SELECT
  'admin_overrides table' AS check_name,
  to_regclass('public.admin_overrides') IS NOT NULL AS ok;

SELECT
  'admin_overrides_archive table' AS check_name,
  to_regclass('public.admin_overrides_archive') IS NOT NULL AS ok;

-- 2) Required column on hot table
SELECT
  'admin_overrides.is_archived column' AS check_name,
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'admin_overrides'
      AND column_name = 'is_archived'
  ) AS ok;

-- 3) REPLICA IDENTITY FULL enabled (required for full-row realtime payloads)
SELECT
  'admin_overrides replica identity full' AS check_name,
  (SELECT relreplident = 'f' FROM pg_class WHERE oid = 'public.admin_overrides'::regclass) AS ok;

-- 4) Functions present
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

-- 5) Critical indexes present (hot + archive)
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

-- 6) Archive table RLS + policy present
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
