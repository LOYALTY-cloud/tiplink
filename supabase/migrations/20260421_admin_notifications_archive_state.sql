-- Keep notification audit history while removing handled items from active views.

alter table public.admin_notifications
  add column if not exists archived boolean not null default false;

create index if not exists idx_admin_notifications_active
  on public.admin_notifications (archived, status, created_at desc);

-- Backfill: resolved/dismissed items are archived by default.
update public.admin_notifications
set archived = true
where status in ('resolved', 'dismissed')
  and archived = false;
