-- Theme earnings pipeline — status tracking + payout requests

-- ── 1. Add status lifecycle columns to theme_sales ───────────────────────────
-- status: pending (just paid) → approved (3-day hold cleared) → paid (transferred)
--         canceled (refund / dispute)

alter table public.theme_sales
  add column if not exists status      text        not null default 'pending'
    check (status in ('pending', 'approved', 'paid', 'canceled')),
  add column if not exists approved_at timestamptz,
  add column if not exists paid_at     timestamptz;

create index if not exists idx_theme_sales_seller_status
  on public.theme_sales (seller_id, status);

comment on column public.theme_sales.status      is 'pending→approved (3-day hold)→paid→canceled';
comment on column public.theme_sales.approved_at is 'When the hold cleared and earnings became withdrawable.';
comment on column public.theme_sales.paid_at     is 'When the Stripe transfer was executed.';

-- ── 2. payout_requests ───────────────────────────────────────────────────────

create table if not exists public.payout_requests (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references auth.users(id) on delete cascade,
  amount             numeric(10,2) not null check (amount > 0),
  status             text        not null default 'pending'
    check (status in ('pending', 'processing', 'paid', 'failed')),
  stripe_transfer_id text,
  failure_reason     text,
  created_at         timestamptz not null default now(),
  processed_at       timestamptz
);

create index if not exists idx_payout_requests_user_id
  on public.payout_requests (user_id, created_at desc);

-- RLS: users see only their own
alter table public.payout_requests enable row level security;

create policy "payout_requests: select own"
  on public.payout_requests for select
  using (auth.uid() = user_id);

comment on table public.payout_requests is 'Creator withdrawal requests. Processed via Stripe Connect transfers.';
comment on column public.payout_requests.stripe_transfer_id is 'Stripe transfer object ID — set when processing succeeds.';
comment on column public.payout_requests.failure_reason     is 'Human-readable error if transfer failed.';
