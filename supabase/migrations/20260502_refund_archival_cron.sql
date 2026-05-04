-- Schedule refund archival to run nightly
-- Archives completed refunds (approved or rejected) older than 60 days

-- First ensure pg_cron extension exists
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove any existing refund archival job (safe no-op if not exists)
SELECT cron.unschedule('archive_refund_requests') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'archive_refund_requests');

-- Schedule the archival to run daily at 2 AM UTC
SELECT cron.schedule(
  'archive_refund_requests',
  '0 2 * * *',
  'SELECT move_archived_refund_requests_to_archive(60, 5000)'
);

-- Verify it's scheduled
SELECT
  jobid,
  jobname,
  schedule,
  command,
  nodename,
  nodeport,
  database,
  username,
  active
FROM cron.job
WHERE jobname = 'archive_refund_requests';
