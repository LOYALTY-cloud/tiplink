-- =============================================
-- SUPPORT TICKETS — Async issue tracking system
-- Run in Supabase SQL Editor. Safe to re-run.
-- =============================================

-- Tickets table
create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  subject text not null,
  category text not null default 'other',
  message text not null,
  status text not null default 'open',        -- open | in_progress | resolved | closed
  priority int not null default 0,            -- 0=normal, 1=medium, 2=high, 3=critical
  assigned_admin_id uuid,
  file_url text,
  file_type text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_support_tickets_user
on support_tickets (user_id, created_at desc);

create index if not exists idx_support_tickets_status
on support_tickets (status, priority desc, created_at asc);

create index if not exists idx_support_tickets_admin
on support_tickets (assigned_admin_id, status)
where assigned_admin_id is not null;

-- Ticket messages thread
create table if not exists support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id) on delete cascade,
  sender_type text not null,                  -- user | admin | system
  sender_id uuid,
  sender_name text,
  message text not null,
  file_url text,
  file_type text,
  created_at timestamptz not null default now()
);

create index if not exists idx_support_ticket_messages_ticket
on support_ticket_messages (ticket_id, created_at asc);

-- Enable realtime for ticket updates
alter publication supabase_realtime add table support_tickets;
alter publication supabase_realtime add table support_ticket_messages;

-- RLS policies
alter table support_tickets enable row level security;
alter table support_ticket_messages enable row level security;

-- Users can read their own tickets
create policy "Users read own tickets"
on support_tickets for select
using (auth.uid() = user_id);

-- Users can insert their own tickets
create policy "Users create own tickets"
on support_tickets for insert
with check (auth.uid() = user_id);

-- Service role can do everything (for admin API routes)
create policy "Service role full access tickets"
on support_tickets for all
using (auth.role() = 'service_role');

create policy "Users read own ticket messages"
on support_ticket_messages for select
using (
  exists (
    select 1 from support_tickets
    where support_tickets.id = support_ticket_messages.ticket_id
      and support_tickets.user_id = auth.uid()
  )
);

create policy "Service role full access ticket messages"
on support_ticket_messages for all
using (auth.role() = 'service_role');
