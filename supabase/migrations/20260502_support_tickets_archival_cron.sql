-- ============================================================
-- Schedule support tickets archival
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('archive_closed_resolved_support_tickets')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'archive_closed_resolved_support_tickets'
);

SELECT cron.schedule(
  'archive_closed_resolved_support_tickets',
  '15 2 * * *',
  'SELECT move_closed_resolved_tickets_to_archive(60, 5000)'
);

SELECT
  jobid,
  jobname,
  schedule,
  command,
  active
FROM cron.job
WHERE jobname = 'archive_closed_resolved_support_tickets';
