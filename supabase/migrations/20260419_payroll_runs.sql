-- Payroll runs (one per period)
create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  status text not null default 'pending', -- pending | paid
  total_amount numeric not null default 0,
  created_at timestamptz default now(),
  paid_at timestamptz
);

-- Prevent duplicate runs for same date range
create unique index idx_payroll_runs_period on public.payroll_runs (start_date, end_date);

-- Fast cursor-based pagination on history
create index idx_payroll_runs_created on public.payroll_runs (created_at desc);

-- Items per admin in a run (snapshot)
create table public.payroll_items (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid references public.payroll_runs(id) on delete cascade,
  admin_id uuid not null,
  name text,
  role text,
  hours numeric not null,
  rate numeric not null,
  total_pay numeric not null,
  created_at timestamptz default now()
);

-- Fast admin-profile lookups across all runs
create index idx_payroll_items_admin on public.payroll_items (admin_id);

-- Lock down (service role only)
alter table public.payroll_runs enable row level security;
alter table public.payroll_items enable row level security;

create policy "no client access runs" on public.payroll_runs for all using (false);
create policy "no client access items" on public.payroll_items for all using (false);
