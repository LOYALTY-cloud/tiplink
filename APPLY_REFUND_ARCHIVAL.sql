-- ============================================================
-- REFUND ARCHIVAL SYSTEM - APPLY SCRIPT
-- Run this in Supabase SQL Editor after migrations are applied
-- ============================================================

-- ==============================================================================
-- STEP 1: CREATE ARCHIVE TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS refund_requests_archive (
  id uuid PRIMARY KEY,
  tip_intent_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  amount numeric NOT NULL,
  status text NOT NULL,
  required_approvals int NOT NULL,
  requires_owner boolean NOT NULL,
  created_at timestamptz NOT NULL,
  
  CONSTRAINT refund_requests_archive_status_check CHECK (status IN ('pending', 'approved', 'rejected'))
);

-- Defensive hardening for environments where the table pre-existed without a PK/unique on id.
DO $$
DECLARE
  dup_count bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.refund_requests_archive'::regclass
      AND contype = 'p'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_class idx ON idx.oid = i.indexrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'refund_requests_archive'
      AND i.indisunique = true
      AND i.indkey::text = (
        SELECT attnum::text
        FROM pg_attribute
        WHERE attrelid = 'public.refund_requests_archive'::regclass
          AND attname = 'id'
          AND NOT attisdropped
      )
  ) THEN
    SELECT COUNT(*) INTO dup_count
    FROM (
      SELECT id
      FROM refund_requests_archive
      GROUP BY id
      HAVING COUNT(*) > 1
    ) d;

    IF dup_count = 0 THEN
      ALTER TABLE refund_requests_archive
      ADD CONSTRAINT refund_requests_archive_pkey PRIMARY KEY (id);
    ELSE
      RAISE WARNING 'refund_requests_archive has duplicate id values (%). Skipping PK add; archival function still uses NOT EXISTS fallback.', dup_count;
    END IF;
  END IF;
END;
$$;

-- ==============================================================================
-- STEP 2: CREATE INDEXES
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_refund_requests_archive_created_at_desc
  ON refund_requests_archive(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_refund_requests_archive_status_created_at_desc
  ON refund_requests_archive(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_refund_requests_archive_tip_created_at_desc
  ON refund_requests_archive(tip_intent_id, created_at DESC);

-- ==============================================================================
-- STEP 3: ENABLE ROW LEVEL SECURITY
-- ==============================================================================

ALTER TABLE refund_requests_archive ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- STEP 4: CREATE RLS POLICY (Service role only)
-- ==============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'refund_requests_archive'
      AND policyname = 'Service role full access on refund_requests_archive'
  ) THEN
    CREATE POLICY "Service role full access on refund_requests_archive"
      ON refund_requests_archive FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END;
$$;

-- ==============================================================================
-- STEP 5: CREATE ARCHIVE FUNCTION
-- ==============================================================================

CREATE OR REPLACE FUNCTION move_archived_refund_requests_to_archive(
  retention_days INTEGER DEFAULT 60,
  batch_size INTEGER DEFAULT 5000
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  moved_count INTEGER;
BEGIN
  WITH candidates AS (
    SELECT id
    FROM refund_requests
    WHERE status IN ('approved', 'rejected')
      AND created_at < now() - make_interval(days => retention_days)
    ORDER BY created_at ASC
    LIMIT batch_size
  ),
  moved_rows AS (
    INSERT INTO refund_requests_archive (
      id,
      tip_intent_id,
      requested_by,
      amount,
      status,
      required_approvals,
      requires_owner,
      created_at
    )
    SELECT
      src.id,
      src.tip_intent_id,
      src.requested_by,
      src.amount,
      src.status,
      src.required_approvals,
      src.requires_owner,
      src.created_at
    FROM refund_requests src
    INNER JOIN candidates c ON c.id = src.id
    WHERE NOT EXISTS (
      SELECT 1
      FROM refund_requests_archive a
      WHERE a.id = src.id
    )
    RETURNING id
  ),
  deleted AS (
    DELETE FROM refund_requests active
    USING candidates
    WHERE active.id = candidates.id
    RETURNING active.id
  )
  SELECT COUNT(*) INTO moved_count FROM deleted;
  RETURN moved_count;
END;
$$;

-- ==============================================================================
-- STEP 6: HARDENING - SET SEARCH_PATH
-- ==============================================================================

ALTER FUNCTION public.move_archived_refund_requests_to_archive(integer, integer) SET search_path = 'public';

-- ==============================================================================
-- STEP 7: HARDENING - REVOKE PUBLIC RPC ACCESS
-- ==============================================================================

REVOKE EXECUTE ON FUNCTION public.move_archived_refund_requests_to_archive(integer, integer) FROM public, anon, authenticated;

-- ==============================================================================
-- STEP 8: SCHEDULE CRON JOB
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove any existing refund archival job (safe no-op if not exists)
SELECT cron.unschedule('archive_refund_requests') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'archive_refund_requests');

-- Schedule the archival to run daily at 2 AM UTC (60-day retention by default)
SELECT cron.schedule(
  'archive_refund_requests',
  '0 2 * * *',
  'SELECT move_archived_refund_requests_to_archive(60, 5000)'
);

-- ==============================================================================
-- STEP 9: VERIFY SETUP
-- ==============================================================================

-- Check archive table exists
SELECT
  'refund_requests_archive table' AS check_name,
  to_regclass('public.refund_requests_archive') IS NOT NULL AS ok;

-- Check function exists
SELECT
  'move_archived_refund_requests_to_archive function' AS check_name,
  EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'move_archived_refund_requests_to_archive'
  ) AS ok;

-- Check indexes exist
SELECT
  index_name,
  EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE indexname = index_name
  ) AS ok
FROM (
  VALUES
    ('idx_refund_requests_archive_created_at_desc'),
    ('idx_refund_requests_archive_status_created_at_desc'),
    ('idx_refund_requests_archive_tip_created_at_desc')
) AS t(index_name);

-- Check RLS is enabled
SELECT
  'refund_requests_archive RLS enabled' AS check_name,
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.refund_requests_archive'::regclass) AS ok;

-- Check cron job is scheduled
SELECT
  jobname,
  schedule,
  command,
  active
FROM cron.job
WHERE jobname = 'archive_refund_requests';

-- Check current refund counts
SELECT
  'Pending refunds' AS type, COUNT(*) as count FROM refund_requests WHERE status = 'pending'
UNION ALL
SELECT
  'Approved refunds', COUNT(*) FROM refund_requests WHERE status = 'approved'
UNION ALL
SELECT
  'Rejected refunds', COUNT(*) FROM refund_requests WHERE status = 'rejected'
UNION ALL
SELECT
  'Archived refunds', COUNT(*) FROM refund_requests_archive;

-- Manual archival test (run once to verify):
--   SELECT move_archived_refund_requests_to_archive(0);  -- Archive everything older than today
--   ANALYZE refund_requests_archive;
