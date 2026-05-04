-- Add deep-link destination for admin notifications.

alter table public.admin_notifications
  add column if not exists link text;

create index if not exists idx_admin_notifications_link
  on public.admin_notifications (link);
