-- Support sessions table for real-time admin support
-- Run in Supabase SQL Editor

create table if not exists support_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  status text default 'waiting', -- waiting | active | closed
  last_message text,
  assigned_admin_id uuid,
  assigned_admin_name text,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Index for fast queue lookups
create index if not exists idx_support_sessions_status
on support_sessions (status);

-- Enable realtime for support_sessions
alter publication supabase_realtime add table support_sessions;
