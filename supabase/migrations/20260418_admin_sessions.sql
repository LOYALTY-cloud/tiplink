-- Admin work-session tracking for payroll
create table public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null,
  started_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  ended_at timestamptz,
  total_active_seconds integer not null default 0,
  created_at timestamptz default now()
);

create index idx_admin_sessions_admin_id on public.admin_sessions (admin_id);
create index idx_admin_sessions_open on public.admin_sessions (admin_id) where ended_at is null;

-- RLS: no client access — service role only
alter table public.admin_sessions enable row level security;

create policy "no client access"
on public.admin_sessions
for all
using (false);
