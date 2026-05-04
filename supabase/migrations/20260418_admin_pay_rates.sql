-- Editable pay rates: per-role defaults + per-admin overrides
create table public.admin_pay_rates (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid,          -- set for per-admin override, null for role default
  role text,              -- set for role default, null for per-admin override
  hourly_rate numeric not null,
  created_at timestamptz default now(),

  -- exactly one of admin_id or role must be set
  constraint chk_rate_target check (
    (admin_id is not null and role is null)
    or (admin_id is null and role is not null)
  )
);

-- One override per admin, one default per role
create unique index idx_pay_rates_admin on public.admin_pay_rates (admin_id) where admin_id is not null;
create unique index idx_pay_rates_role  on public.admin_pay_rates (role) where role is not null;

-- Seed default role rates
insert into public.admin_pay_rates (role, hourly_rate) values
  ('support_admin', 15),
  ('finance_admin', 20),
  ('super_admin', 25);

-- RLS: no client access — service role only
alter table public.admin_pay_rates enable row level security;

create policy "no public access"
on public.admin_pay_rates
for all
using (false);
