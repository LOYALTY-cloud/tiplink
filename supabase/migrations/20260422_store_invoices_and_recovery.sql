-- Store billing reliability layer
-- Adds invoice history and failed-payment recovery fields.

create table if not exists public.store_invoices (
  id uuid primary key default gen_random_uuid(),

  user_id uuid references auth.users(id) on delete set null,
  store_id uuid references public.creator_stores(id) on delete set null,

  amount numeric not null,
  status text not null check (status in ('paid', 'failed', 'pending')),

  billing_type text not null check (billing_type in ('stripe', 'balance')),

  stripe_invoice_id text,

  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists idx_store_invoices_user_created on public.store_invoices (user_id, created_at desc);
create index if not exists idx_store_invoices_store_created on public.store_invoices (store_id, created_at desc);
create unique index if not exists uq_store_invoices_stripe_invoice_id
  on public.store_invoices (stripe_invoice_id)
  where stripe_invoice_id is not null;

alter table public.creator_stores
  add column if not exists billing_status text not null default 'active',
  add column if not exists grace_until timestamptz;

comment on table public.store_invoices is 'Invoice log for creator store billing charges and failures.';
comment on column public.store_invoices.amount is 'Charge amount in USD.';
comment on column public.store_invoices.status is 'Invoice payment status: paid, failed, or pending.';
comment on column public.store_invoices.billing_type is 'Payment rail used for this invoice (stripe or balance).';
comment on column public.store_invoices.stripe_invoice_id is 'Stripe invoice ID for card charges.';
comment on column public.creator_stores.billing_status is 'Store billing state: active, past_due, canceled.';
comment on column public.creator_stores.grace_until is 'Store deactivates when in past_due and grace_until has passed.';

alter table public.store_invoices enable row level security;

create policy "store_invoices: owner select"
  on public.store_invoices for select
  using (auth.uid() = user_id);
