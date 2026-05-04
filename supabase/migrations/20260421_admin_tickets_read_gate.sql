-- Enforce disciplinary read-before-acknowledge flow.

alter table public.admin_tickets
  add column if not exists read_at timestamptz;

create index if not exists idx_admin_tickets_to_status_read
  on public.admin_tickets (to_admin_id, status, read_at);
