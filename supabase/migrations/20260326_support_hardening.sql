-- =============================================
-- FULL SUPPORT SYSTEM SCHEMA + HARDENING
-- Run this in Supabase SQL Editor in one shot.
-- Safe to re-run (uses IF NOT EXISTS / IF EXISTS)
-- =============================================

-- ============================================
-- 0. BASE TABLES
-- ============================================

-- support_sessions (may already exist)
create table if not exists support_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  status text default 'waiting',
  last_message text,
  assigned_admin_id uuid,
  assigned_admin_name text,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create index if not exists idx_support_sessions_status
on support_sessions (status);

-- Enable realtime (ignore error if already added)
do $$ begin
  alter publication supabase_realtime add table support_sessions;
exception when others then null;
end $$;

-- support_messages
create table if not exists support_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references support_sessions(id) on delete cascade,
  sender_type text not null,
  sender_id uuid,
  sender_name text,
  message text not null,
  created_at timestamp default now()
);

create index if not exists idx_support_messages_session
on support_messages (session_id, created_at);

do $$ begin
  alter publication supabase_realtime add table support_messages;
exception when others then null;
end $$;

-- Trigger: auto-update last_message on new message
create or replace function update_session_last_message()
returns trigger as $$
begin
  update support_sessions
  set last_message = NEW.message,
      updated_at = now()
  where id = NEW.session_id;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists trg_support_message_update_session on support_messages;
create trigger trg_support_message_update_session
after insert on support_messages
for each row
execute function update_session_last_message();

-- ============================================
-- 1. SOFT DELETE: closed_at + closed_by
-- ============================================
alter table support_sessions
  add column if not exists closed_at timestamp,
  add column if not exists closed_by text; -- 'user' | 'admin' | 'system'

-- Update close_stale_support_sessions to set closed_at
drop function if exists close_stale_support_sessions();
create or replace function close_stale_support_sessions()
returns void as $$
begin
  update support_sessions
  set status = 'closed',
      closed_by = 'system',
      closed_at = now(),
      updated_at = now()
  where status in ('waiting', 'active')
    and updated_at < now() - interval '30 minutes';
end;
$$ language plpgsql;

-- ============================================
-- 2. TYPING INDICATORS
-- ============================================
create table if not exists support_typing (
  session_id uuid primary key references support_sessions(id) on delete cascade,
  admin_id uuid,
  user_typing boolean default false,
  admin_typing boolean default false,
  updated_at timestamp default now()
);

do $$ begin
  alter publication supabase_realtime add table support_typing;
exception when others then null;
end $$;

-- ============================================
-- 3. SEEN STATUS
-- ============================================
alter table support_messages
  add column if not exists seen_at timestamp;

-- ============================================
-- 4. PRIORITY QUEUE
-- ============================================
alter table support_sessions
  add column if not exists priority int default 0;
-- 0 = normal, 1 = medium, 2 = high, 3 = critical

create index if not exists idx_support_sessions_priority
on support_sessions (status, priority desc, created_at asc);

-- ============================================
-- 5. FILE / IMAGE ATTACHMENTS
-- ============================================
alter table support_messages
  add column if not exists file_url text,
  add column if not exists file_type text;

-- ============================================
-- 6. SUPPORT NOTIFICATIONS (transfer handoff)
-- ============================================
create table if not exists support_notifications (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references support_sessions(id) on delete cascade,
  from_admin_id uuid,
  from_admin_name text,
  to_admin_id uuid,
  type text default 'transfer_request',
  status text default 'pending',
  metadata jsonb default '{}',
  created_at timestamp default now()
);

create index if not exists idx_support_notifications_to_admin
on support_notifications (to_admin_id, status, created_at desc);

do $$ begin
  alter publication supabase_realtime add table support_notifications;
exception when others then null;
end $$;
