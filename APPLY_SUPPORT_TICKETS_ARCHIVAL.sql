-- ============================================================
-- APPLY: SUPPORT TICKETS HARD ARCHIVE (closed/resolved)
-- Run this in Supabase SQL Editor
-- ============================================================

-- Ensure all expected columns exist on support_tickets (idempotent)
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS breach_notified boolean DEFAULT false;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS waiting_on text DEFAULT 'admin';
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS last_user_reply_at timestamptz;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS auto_close_warning_sent boolean DEFAULT false;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS sla_response_deadline timestamptz;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS sla_resolve_deadline timestamptz;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS first_response_at timestamptz;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS source text DEFAULT 'web';
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS source_session_id text;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS breach_count int NOT NULL DEFAULT 0;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS watchers uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS reminder_sent boolean NOT NULL DEFAULT false;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS nudge_count int NOT NULL DEFAULT 0;
ALTER TABLE public.support_ticket_messages ADD COLUMN IF NOT EXISTS is_internal boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS support_tickets_archive (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  subject text NOT NULL,
  category text NOT NULL,
  message text NOT NULL,
  status text NOT NULL CHECK (status IN ('resolved', 'closed')),
  priority int NOT NULL,
  assigned_admin_id uuid,
  file_url text,
  file_type text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  breach_notified boolean,
  waiting_on text,
  last_user_reply_at timestamptz,
  auto_close_warning_sent boolean,
  sla_response_deadline timestamptz,
  sla_resolve_deadline timestamptz,
  first_response_at timestamptz,
  source text,
  source_session_id text,
  reminder_sent boolean,
  nudge_count int,
  breach_count int,
  watchers uuid[]
);

CREATE TABLE IF NOT EXISTS support_ticket_messages_archive (
  id uuid PRIMARY KEY,
  ticket_id uuid NOT NULL REFERENCES support_tickets_archive(id) ON DELETE CASCADE,
  sender_type text NOT NULL,
  sender_id uuid,
  sender_name text,
  message text NOT NULL,
  file_url text,
  file_type text,
  created_at timestamptz NOT NULL,
  is_internal boolean
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_archive_updated_at_desc
  ON support_tickets_archive(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_archive_status_updated_at_desc
  ON support_tickets_archive(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_archive_user_updated_at_desc
  ON support_tickets_archive(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_archive_ticket_created_at
  ON support_ticket_messages_archive(ticket_id, created_at ASC);

ALTER TABLE support_tickets_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_messages_archive ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'support_tickets_archive'
      AND policyname = 'Service role full access on support_tickets_archive'
  ) THEN
    CREATE POLICY "Service role full access on support_tickets_archive"
      ON support_tickets_archive FOR ALL
      USING (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'support_ticket_messages_archive'
      AND policyname = 'Service role full access on support_ticket_messages_archive'
  ) THEN
    CREATE POLICY "Service role full access on support_ticket_messages_archive"
      ON support_ticket_messages_archive FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END;
$$;

-- Drop old version if it exists to ensure clean recreation
DROP FUNCTION IF EXISTS move_closed_resolved_tickets_to_archive(integer, integer) CASCADE;

CREATE FUNCTION move_closed_resolved_tickets_to_archive(
  retention_days integer DEFAULT 60,
  batch_size integer DEFAULT 5000
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  moved_count integer;
BEGIN
  WITH candidates AS (
    SELECT id
    FROM support_tickets
    WHERE status IN ('closed', 'resolved')
      AND updated_at < now() - make_interval(days => retention_days)
    ORDER BY updated_at ASC
    LIMIT batch_size
  ),
  moved_tickets AS (
    INSERT INTO support_tickets_archive (
      id, user_id, subject, category, message, status, priority, assigned_admin_id,
      file_url, file_type, resolved_at, created_at, updated_at, breach_notified,
      waiting_on, last_user_reply_at, auto_close_warning_sent, sla_response_deadline,
      sla_resolve_deadline, first_response_at, source, source_session_id,
      breach_count, watchers, reminder_sent, nudge_count
    )
    SELECT
      src.id, src.user_id, src.subject, src.category, src.message, src.status,
      src.priority, src.assigned_admin_id, src.file_url, src.file_type, src.resolved_at,
      src.created_at, src.updated_at,
      COALESCE(src.breach_notified, false),
      COALESCE(src.waiting_on, 'admin'),
      src.last_user_reply_at,
      COALESCE(src.auto_close_warning_sent, false),
      src.sla_response_deadline,
      src.sla_resolve_deadline, src.first_response_at,
      COALESCE(src.source, 'web'),
      src.source_session_id,
      COALESCE(src.breach_count, 0),
      COALESCE(src.watchers, '{}'),
      COALESCE(src.reminder_sent, false),
      COALESCE(src.nudge_count, 0)
    FROM support_tickets src
    INNER JOIN candidates c ON c.id = src.id
    WHERE NOT EXISTS (
      SELECT 1 FROM support_tickets_archive a WHERE a.id = src.id
    )
    RETURNING id
  ),
  moved_messages AS (
    INSERT INTO support_ticket_messages_archive (
      id, ticket_id, sender_type, sender_id, sender_name, message, file_url, file_type, created_at, is_internal
    )
    SELECT
      m.id, m.ticket_id, m.sender_type, m.sender_id, m.sender_name,
      m.message, m.file_url, m.file_type, m.created_at, m.is_internal
    FROM support_ticket_messages m
    INNER JOIN candidates c ON c.id = m.ticket_id
    WHERE NOT EXISTS (
      SELECT 1 FROM support_ticket_messages_archive ma WHERE ma.id = m.id
    )
    RETURNING id
  ),
  deleted AS (
    DELETE FROM support_tickets t
    USING candidates c
    WHERE t.id = c.id
    RETURNING t.id
  )
  SELECT COUNT(*) INTO moved_count FROM deleted;

  RETURN moved_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.move_closed_resolved_tickets_to_archive(integer, integer)
  FROM public, anon, authenticated;

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

-- Verification snapshot
SELECT
  (SELECT COUNT(*) FROM support_tickets WHERE status IN ('closed', 'resolved')) AS closed_resolved_hot,
  (SELECT COUNT(*) FROM support_tickets_archive) AS archived_tickets,
  (SELECT COUNT(*) FROM support_ticket_messages_archive) AS archived_messages;
