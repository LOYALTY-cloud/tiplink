-- Support messages table for real-time chat
-- Run in Supabase SQL Editor

-- 1. Create support_messages table
create table if not exists support_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references support_sessions(id) on delete cascade,
  sender_type text not null, -- 'user' | 'admin'
  sender_id uuid,
  sender_name text,
  message text not null,
  created_at timestamp default now()
);

-- Index for fast message lookups by session
create index if not exists idx_support_messages_session
on support_messages (session_id, created_at);

-- Enable realtime for support_messages
alter publication supabase_realtime add table support_messages;

-- 2. Trigger: auto-update support_sessions.last_message on new message
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

create trigger trg_support_message_update_session
after insert on support_messages
for each row
execute function update_session_last_message();

-- 3. Auto-close stale sessions (inactive > 30 minutes)
-- Call this via pg_cron or a scheduled edge function
create or replace function close_stale_support_sessions()
returns void as $$
begin
  update support_sessions
  set status = 'closed',
      updated_at = now()
  where status in ('waiting', 'active')
    and updated_at < now() - interval '30 minutes';
end;
$$ language plpgsql;
