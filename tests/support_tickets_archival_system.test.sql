-- ============================================================
-- SUPPORT TICKETS ARCHIVAL SYSTEM TEST SUITE
-- ============================================================

DO $$
BEGIN
  ASSERT to_regclass('public.support_tickets_archive') IS NOT NULL,
    'TEST 1 FAILED: support_tickets_archive table does not exist';

  ASSERT to_regclass('public.support_ticket_messages_archive') IS NOT NULL,
    'TEST 1 FAILED: support_ticket_messages_archive table does not exist';

  RAISE INFO '[TEST 1 PASS] Archive tables exist';
END;
$$;

DO $$
DECLARE
  fn_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'move_closed_resolved_tickets_to_archive'
  ) INTO fn_exists;

  ASSERT fn_exists, 'TEST 2 FAILED: archive function does not exist';
  RAISE INFO '[TEST 2 PASS] Archive function exists';
END;
$$;

DO $$
DECLARE
  rls_tickets boolean;
  rls_messages boolean;
BEGIN
  SELECT relrowsecurity INTO rls_tickets FROM pg_class WHERE oid = 'public.support_tickets_archive'::regclass LIMIT 1;
  SELECT relrowsecurity INTO rls_messages FROM pg_class WHERE oid = 'public.support_ticket_messages_archive'::regclass LIMIT 1;

  ASSERT rls_tickets, 'TEST 3 FAILED: RLS not enabled on support_tickets_archive';
  ASSERT rls_messages, 'TEST 3 FAILED: RLS not enabled on support_ticket_messages_archive';

  ASSERT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'support_tickets_archive'
      AND policyname = 'Service role full access on support_tickets_archive'
  ), 'TEST 3 FAILED: service role policy missing on support_tickets_archive';

  ASSERT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'support_ticket_messages_archive'
      AND policyname = 'Service role full access on support_ticket_messages_archive'
  ), 'TEST 3 FAILED: service role policy missing on support_ticket_messages_archive';

  RAISE INFO '[TEST 3 PASS] RLS and policies are correct';
END;
$$;

DO $$
DECLARE
  test_user_id uuid := gen_random_uuid();
  old_closed_id uuid;
  old_resolved_id uuid;
  recent_closed_id uuid;
  open_ticket_id uuid;
  moved_count int;
  call_succeeded boolean := false;
BEGIN
  INSERT INTO support_tickets (
    user_id, subject, category, message, status, priority, waiting_on,
    created_at, updated_at, last_user_reply_at
  ) VALUES
  (test_user_id, '[ARCHIVE TEST] old closed', 'other', 'seed', 'closed', 1, 'admin',
    now() - interval '90 days', now() - interval '90 days', now() - interval '90 days'),
  (test_user_id, '[ARCHIVE TEST] old resolved', 'other', 'seed', 'resolved', 1, 'admin',
    now() - interval '75 days', now() - interval '75 days', now() - interval '75 days'),
  (test_user_id, '[ARCHIVE TEST] recent closed', 'other', 'seed', 'closed', 1, 'admin',
    now() - interval '5 days', now() - interval '5 days', now() - interval '5 days'),
  (test_user_id, '[ARCHIVE TEST] open', 'other', 'seed', 'open', 1, 'admin',
    now() - interval '120 days', now() - interval '120 days', now() - interval '120 days');

  SELECT id INTO old_closed_id FROM support_tickets WHERE subject = '[ARCHIVE TEST] old closed' ORDER BY created_at DESC LIMIT 1;
  SELECT id INTO old_resolved_id FROM support_tickets WHERE subject = '[ARCHIVE TEST] old resolved' ORDER BY created_at DESC LIMIT 1;
  SELECT id INTO recent_closed_id FROM support_tickets WHERE subject = '[ARCHIVE TEST] recent closed' ORDER BY created_at DESC LIMIT 1;
  SELECT id INTO open_ticket_id FROM support_tickets WHERE subject = '[ARCHIVE TEST] open' ORDER BY created_at DESC LIMIT 1;

  INSERT INTO support_ticket_messages (ticket_id, sender_type, message, created_at)
  VALUES
    (old_closed_id, 'user', 'old closed msg', now() - interval '89 days'),
    (old_resolved_id, 'admin', 'old resolved msg', now() - interval '74 days'),
    (recent_closed_id, 'user', 'recent msg', now() - interval '4 days'),
    (open_ticket_id, 'user', 'open msg', now() - interval '119 days');

  BEGIN
    EXECUTE 'SELECT public.move_closed_resolved_tickets_to_archive(60, 5000)' INTO moved_count;
    call_succeeded := true;
  EXCEPTION WHEN undefined_function THEN
    call_succeeded := false;
  END;

  ASSERT call_succeeded, 'TEST 4 FAILED: could not call move_closed_resolved_tickets_to_archive(60, 5000)';

  ASSERT moved_count >= 2, 'TEST 4 FAILED: expected at least 2 tickets moved';

  ASSERT NOT EXISTS (
    SELECT 1 FROM support_tickets WHERE id IN (old_closed_id, old_resolved_id)
  ), 'TEST 4 FAILED: old closed/resolved tickets still in hot table';

  ASSERT EXISTS (
    SELECT 1 FROM support_tickets_archive WHERE id IN (old_closed_id, old_resolved_id)
  ), 'TEST 4 FAILED: old tickets missing from archive table';

  ASSERT EXISTS (
    SELECT 1 FROM support_ticket_messages_archive
    WHERE ticket_id IN (old_closed_id, old_resolved_id)
  ), 'TEST 4 FAILED: archived tickets'' messages missing from archive messages table';

  ASSERT EXISTS (
    SELECT 1 FROM support_tickets WHERE id = recent_closed_id
  ), 'TEST 4 FAILED: recent closed ticket should remain hot';

  ASSERT EXISTS (
    SELECT 1 FROM support_tickets WHERE id = open_ticket_id
  ), 'TEST 4 FAILED: open ticket should remain hot';

  -- Cleanup test data from both hot and archive tables
  DELETE FROM support_ticket_messages_archive WHERE ticket_id IN (old_closed_id, old_resolved_id, recent_closed_id, open_ticket_id);
  DELETE FROM support_tickets_archive WHERE id IN (old_closed_id, old_resolved_id, recent_closed_id, open_ticket_id);
  DELETE FROM support_ticket_messages WHERE ticket_id IN (old_closed_id, old_resolved_id, recent_closed_id, open_ticket_id);
  DELETE FROM support_tickets WHERE id IN (old_closed_id, old_resolved_id, recent_closed_id, open_ticket_id);

  RAISE INFO '[TEST 4 PASS] Archive movement and retention logic works';
END;
$$;

DO $$
DECLARE
  cron_count int;
  cron_active bool;
  cron_schedule text;
  cron_command text;
BEGIN
  SELECT COUNT(*) INTO cron_count FROM cron.job WHERE jobname = 'archive_closed_resolved_support_tickets';
  ASSERT cron_count > 0, 'TEST 5 FAILED: cron job not scheduled';

  SELECT active, schedule, command
  INTO cron_active, cron_schedule, cron_command
  FROM cron.job
  WHERE jobname = 'archive_closed_resolved_support_tickets'
  LIMIT 1;

  ASSERT cron_active = true, 'TEST 5 FAILED: cron job is not active';
  ASSERT cron_schedule = '15 2 * * *', 'TEST 5 FAILED: cron schedule mismatch';
  ASSERT cron_command LIKE '%move_closed_resolved_tickets_to_archive%',
    'TEST 5 FAILED: cron command does not call archive function';

  RAISE INFO '[TEST 5 PASS] Cron job configured correctly';
END;
$$;

DO $$
DECLARE
  config_text text;
BEGIN
  SELECT p.proconfig::text INTO config_text
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'move_closed_resolved_tickets_to_archive'
  LIMIT 1;

  ASSERT config_text LIKE '%search_path=public%',
    'TEST 6 FAILED: search_path hardening missing';

  RAISE INFO '[TEST 6 PASS] search_path hardening verified';
END;
$$;

DO $$
DECLARE
  index_count int;
BEGIN
  SELECT COUNT(*) INTO index_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename IN ('support_tickets_archive', 'support_ticket_messages_archive');

  ASSERT index_count >= 4,
    format('TEST 7 FAILED: expected at least 4 indexes across archive tables, found %s', index_count);

  RAISE INFO '[TEST 7 PASS] Archive indexes present (count=%s)', index_count;
END;
$$;

DO $$
BEGIN
  RAISE INFO 'All support ticket archival tests passed.';
END;
$$;
