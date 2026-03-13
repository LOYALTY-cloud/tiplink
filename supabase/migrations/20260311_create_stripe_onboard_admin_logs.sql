-- Create table to record admin actions on the stripe_onboard_queue
create table if not exists public.stripe_onboard_admin_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null,
  admin_id uuid not null,
  action text not null,
  metadata jsonb,
  created_at timestamptz default now()
);

-- Foreign keys (best-effort; if profiles table uses uuid keys)
alter table if exists public.stripe_onboard_admin_logs
  add constraint stripe_onboard_admin_logs_user_fkey foreign key (user_id) references public.profiles(id) on delete cascade;

alter table if exists public.stripe_onboard_admin_logs
  add constraint stripe_onboard_admin_logs_admin_fkey foreign key (admin_id) references public.profiles(id) on delete cascade;

create index if not exists idx_stripe_onboard_admin_logs_user_id on public.stripe_onboard_admin_logs(user_id);
create index if not exists idx_stripe_onboard_admin_logs_admin_id on public.stripe_onboard_admin_logs(admin_id);
create index if not exists idx_stripe_onboard_admin_logs_created_at on public.stripe_onboard_admin_logs(created_at);
