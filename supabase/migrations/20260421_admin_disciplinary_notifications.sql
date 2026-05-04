-- Admin disciplinary notifications
-- Uses existing admin_tickets as disciplinary records.

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.admins(id) on delete cascade,
  ticket_id uuid references public.admin_tickets(id) on delete set null,
  type text not null,
  title text,
  message text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_notifications_admin_read_created
  on public.admin_notifications (admin_id, read, created_at desc);

create index if not exists idx_admin_notifications_ticket
  on public.admin_notifications (ticket_id);

alter table public.admin_notifications enable row level security;
alter table public.admin_notifications force row level security;

drop policy if exists "admin_notifications_service_only" on public.admin_notifications;

create policy "admin_notifications_service_only"
  on public.admin_notifications for all using (false);
