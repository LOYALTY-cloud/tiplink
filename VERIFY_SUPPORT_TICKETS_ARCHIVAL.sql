-- ============================================================
-- VERIFY: SUPPORT TICKETS HARD ARCHIVE
-- Read-only checks
-- ============================================================

-- Q1: archive tables exist
SELECT 'support_tickets_archive exists' AS check_name,
       to_regclass('public.support_tickets_archive') IS NOT NULL AS ok;

SELECT 'support_ticket_messages_archive exists' AS check_name,
       to_regclass('public.support_ticket_messages_archive') IS NOT NULL AS ok;

-- Q2: function exists
SELECT 'move_closed_resolved_tickets_to_archive exists' AS check_name,
       EXISTS (
         SELECT 1
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname = 'move_closed_resolved_tickets_to_archive'
       ) AS ok;

-- Q3: RLS + policies
SELECT 'support_tickets_archive RLS enabled' AS check_name,
       (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.support_tickets_archive'::regclass) AS ok;

SELECT 'support_ticket_messages_archive RLS enabled' AS check_name,
       (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.support_ticket_messages_archive'::regclass) AS ok;

SELECT 'support_tickets_archive service_role policy' AS check_name,
       EXISTS (
         SELECT 1 FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = 'support_tickets_archive'
           AND policyname = 'Service role full access on support_tickets_archive'
       ) AS ok;

SELECT 'support_ticket_messages_archive service_role policy' AS check_name,
       EXISTS (
         SELECT 1 FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = 'support_ticket_messages_archive'
           AND policyname = 'Service role full access on support_ticket_messages_archive'
       ) AS ok;

-- Q4: key indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_support_tickets_archive_updated_at_desc',
    'idx_support_tickets_archive_status_updated_at_desc',
    'idx_support_tickets_archive_user_updated_at_desc',
    'idx_support_ticket_messages_archive_ticket_created_at'
  )
ORDER BY indexname;

-- Q5: function search_path hardened
SELECT
  p.proname,
  p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'move_closed_resolved_tickets_to_archive';

-- Q6: cron scheduled
SELECT
  jobid,
  jobname,
  schedule,
  command,
  active
FROM cron.job
WHERE jobname = 'archive_closed_resolved_support_tickets';

-- Q7: hot vs archived counts
SELECT
  (SELECT COUNT(*) FROM support_tickets WHERE status IN ('closed', 'resolved')) AS hot_closed_resolved,
  (SELECT COUNT(*) FROM support_tickets_archive) AS archived_tickets,
  (SELECT COUNT(*) FROM support_ticket_messages_archive) AS archived_messages;
