-- Store billing management fields

alter table public.creator_stores
  add column if not exists billing_type text not null default 'balance'
    check (billing_type in ('balance', 'stripe')),
  add column if not exists renews_at timestamptz;

comment on column public.creator_stores.billing_type is 'Current billing source for store subscription (balance or stripe).';
comment on column public.creator_stores.renews_at is 'Next renewal timestamp for active billing cycle.';
