-- Separate UI read-state from business action-state on admin notifications.

alter table public.admin_notifications
  add column if not exists status text not null default 'open'
    check (status in ('open', 'in_progress', 'resolved', 'dismissed')),
  add column if not exists requires_action boolean not null default false,
  add column if not exists resolved_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_admin_notifications_status
  on public.admin_notifications (status, created_at desc);

create index if not exists idx_admin_notifications_requires_action
  on public.admin_notifications (requires_action, status, created_at desc);

-- Backfill: disciplinary notifications should require explicit action by default.
update public.admin_notifications
set requires_action = true
where type = 'disciplinary_report'
  and requires_action = false;
