-- Payout receipts + tax compliance infrastructure

-- ── 1. Extend payout_requests ────────────────────────────────────────────────

alter table public.payout_requests
  add column if not exists receipt_url              text,
  add column if not exists tax_year                 int,
  add column if not exists total_earnings_snapshot  numeric(10,2);

comment on column public.payout_requests.receipt_url             is 'URL to the receipt page for this payout.';
comment on column public.payout_requests.tax_year                is 'Calendar year in which this payout was processed.';
comment on column public.payout_requests.total_earnings_snapshot is 'Total creator earnings at time of payout — used for 1099 reporting.';

-- ── 2. creator_tax_profiles ──────────────────────────────────────────────────
-- Stores voluntary tax info submitted by creators.
-- tax_id (SSN/EIN) is stored as-is — encrypt at rest via Supabase vault or
-- application-layer encryption before populating in production.

create table if not exists public.creator_tax_profiles (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null unique references auth.users(id) on delete cascade,
  legal_name   text,
  email        text,
  country      text        not null default 'US',
  tax_id       text,       -- SSN / EIN — see encryption note above
  submitted    boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.creator_tax_profiles enable row level security;

-- Users can read and upsert only their own row
create policy "tax_profiles: select own"
  on public.creator_tax_profiles for select
  using (auth.uid() = user_id);

create policy "tax_profiles: insert own"
  on public.creator_tax_profiles for insert
  with check (auth.uid() = user_id);

create policy "tax_profiles: update own"
  on public.creator_tax_profiles for update
  using (auth.uid() = user_id);

comment on table  public.creator_tax_profiles         is '1099-ready tax info submitted by creators. tax_id must be encrypted in production.';
comment on column public.creator_tax_profiles.tax_id  is 'SSN or EIN — store encrypted in production.';

-- ── 3. yearly_tax_summaries ──────────────────────────────────────────────────
-- One row per (user, year). Upserted by the tax-summary API or a cron job.

create table if not exists public.yearly_tax_summaries (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  tax_year        int         not null,
  total_earnings  numeric(10,2) not null default 0,
  total_payouts   numeric(10,2) not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, tax_year)
);

create index if not exists idx_yearly_tax_summaries_user
  on public.yearly_tax_summaries (user_id, tax_year desc);

alter table public.yearly_tax_summaries enable row level security;

create policy "tax_summaries: select own"
  on public.yearly_tax_summaries for select
  using (auth.uid() = user_id);

comment on table public.yearly_tax_summaries is 'Per-year earnings + payout totals for 1099 reporting.';
