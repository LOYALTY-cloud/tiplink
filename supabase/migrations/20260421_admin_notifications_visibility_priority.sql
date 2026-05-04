-- Add scoped visibility and priority to admin notifications.

alter table public.admin_notifications
  alter column admin_id drop not null;

alter table public.admin_notifications
  add column if not exists priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'critical')),
  add column if not exists visibility text not null default 'private'
    check (visibility in ('private', 'role', 'global')),
  add column if not exists role_target text[],
  add column if not exists admin_target uuid references public.admins(id) on delete cascade;

update public.admin_notifications
set admin_target = admin_id
where admin_target is null and admin_id is not null;

create index if not exists idx_admin_notifications_visibility_created
  on public.admin_notifications (visibility, created_at desc);

create index if not exists idx_admin_notifications_admin_target_read
  on public.admin_notifications (admin_target, read, created_at desc);

create index if not exists idx_admin_notifications_role_target
  on public.admin_notifications using gin (role_target);

create index if not exists idx_admin_notifications_priority_created
  on public.admin_notifications (priority, created_at desc);
