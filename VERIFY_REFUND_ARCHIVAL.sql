-- ============================================================
-- REFUND ARCHIVAL VERIFICATION QUERIES
-- ============================================================

-- Q1: Verify archive table exists and has correct structure
SELECT
  'refund_requests_archive table exists' AS check_name,
  to_regclass('public.refund_requests_archive') IS NOT NULL AS ok
UNION ALL
SELECT
  'required columns present',
  NOT EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('id'),
        ('tip_intent_id'),
        ('requested_by'),
        ('amount'),
        ('status'),
        ('required_approvals'),
        ('requires_owner'),
        ('created_at')
    ) AS required_columns(column_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'refund_requests_archive'
        AND c.column_name = required_columns.column_name
    )
  )
UNION ALL
SELECT
  'has status constraint',
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'refund_requests_archive_status_check'
      AND conrelid = 'public.refund_requests_archive'::regclass
  );

-- Q2: Verify all indexes were created
SELECT
  'Index Status' AS metric,
  index_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = index_name
  ) THEN 'EXISTS' ELSE 'MISSING' END AS status
FROM (
  VALUES
    ('idx_refund_requests_archive_created_at_desc'),
    ('idx_refund_requests_archive_status_created_at_desc'),
    ('idx_refund_requests_archive_tip_created_at_desc')
) AS t(index_name);

-- Q3: Verify RLS is enabled
SELECT
  'refund_requests_archive RLS enabled' AS check_name,
  CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.refund_requests_archive'::regclass)
    THEN 'YES' ELSE 'NO' END AS ok;

-- Q4: Verify RLS policy exists
SELECT
  'Service role RLS policy' AS check_name,
  CASE WHEN EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'refund_requests_archive'
      AND policyname = 'Service role full access on refund_requests_archive'
  ) THEN 'EXISTS' ELSE 'MISSING' END AS status;

-- Q5: Verify archival function exists with correct signature
SELECT
  'move_archived_refund_requests_to_archive function' AS check_name,
  CASE WHEN EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'move_archived_refund_requests_to_archive'
  ) THEN 'EXISTS' ELSE 'MISSING' END AS status;

-- Q6: Verify function search_path is hardened
SELECT
  'Function search_path hardening' AS check_name,
  p.prosecdef AS is_security_definer,
  CASE WHEN p.proconfig IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(p.proconfig) AS elem WHERE elem LIKE 'search_path=%'
  ) THEN 'HARDENED' ELSE 'NOT SET' END AS status
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'move_archived_refund_requests_to_archive';

-- Q7: Verify archival function has REVOKE (check in pg_auth_members)
SELECT
  'move_archived_refund_requests_to_archive REVOKE status' AS check_name,
  CASE WHEN NOT EXISTS (
    SELECT 1
    FROM information_schema.role_routine_grants
    WHERE routine_name = 'move_archived_refund_requests_to_archive'
      AND grantee IN ('anon', 'authenticated', 'public')
  ) THEN 'REVOKED (OK)' ELSE 'STILL ACCESSIBLE (WARN)' END AS status;

-- Q8: Verify cron job is scheduled
SELECT
  'Cron job scheduled' AS check_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'archive_refund_requests'
  ) THEN 'YES' ELSE 'NO' END AS ok;

-- Q9: Check cron job details
SELECT
  'Cron Job Details' AS metric,
  jobname,
  schedule,
  command,
  active,
  database,
  username
FROM cron.job
WHERE jobname = 'archive_refund_requests';

-- Q10: Table row counts (snapshot of current state)
SELECT
  'Live Table: Pending Refunds' AS metric,
  COUNT(*) AS row_count
FROM refund_requests
WHERE status = 'pending'
UNION ALL
SELECT
  'Live Table: Approved Refunds',
  COUNT(*)
FROM refund_requests
WHERE status = 'approved'
UNION ALL
SELECT
  'Live Table: Rejected Refunds',
  COUNT(*)
FROM refund_requests
WHERE status = 'rejected'
UNION ALL
SELECT
  'Archive Table: Total Archived',
  COUNT(*)
FROM refund_requests_archive;

-- Q11: Age of oldest refund by status (for retention planning)
SELECT
  'Oldest Pending Refund Age (days)' AS metric,
  EXTRACT(DAY FROM (now() - MIN(created_at)))::INT AS age_days,
  TO_CHAR(MIN(created_at), 'YYYY-MM-DD HH24:MI:SS UTC') AS oldest_created_at
FROM refund_requests
WHERE status = 'pending'
UNION ALL
SELECT
  'Oldest Approved Refund Age (days)',
  EXTRACT(DAY FROM (now() - MIN(created_at)))::INT,
  TO_CHAR(MIN(created_at), 'YYYY-MM-DD HH24:MI:SS UTC')
FROM refund_requests
WHERE status = 'approved'
UNION ALL
SELECT
  'Oldest Rejected Refund Age (days)',
  EXTRACT(DAY FROM (now() - MIN(created_at)))::INT,
  TO_CHAR(MIN(created_at), 'YYYY-MM-DD HH24:MI:SS UTC')
FROM refund_requests
WHERE status = 'rejected'
UNION ALL
SELECT
  'Oldest Archived Refund Age (days)',
  EXTRACT(DAY FROM (now() - MIN(created_at)))::INT,
  TO_CHAR(MIN(created_at), 'YYYY-MM-DD HH24:MI:SS UTC')
FROM refund_requests_archive;

-- Q12: Estimate table sizes (when they have data)
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_only_size,
  pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) AS indexes_size
FROM pg_tables
WHERE tablename IN ('refund_requests', 'refund_requests_archive')
ORDER BY tablename;

-- Q13: Verify id uniqueness hardening (PK or unique index on id)
SELECT
  'Archive id uniqueness hardening' AS check_name,
  CASE WHEN EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.refund_requests_archive'::regclass
      AND c.contype = 'p'
  ) OR EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid
    WHERE n.nspname = 'public'
      AND t.relname = 'refund_requests_archive'
      AND a.attname = 'id'
      AND i.indisunique = true
      AND i.indkey::text = a.attnum::text
  ) THEN 'ENFORCED' ELSE 'NOT ENFORCED (legacy table; function fallback still safe)' END AS status;
