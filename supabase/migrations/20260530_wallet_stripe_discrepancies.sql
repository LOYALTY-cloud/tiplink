-- wallet_stripe_discrepancies
-- Tracks cases where our internal wallet balance diverges from Stripe's
-- actual connected account available balance.
create table if not exists wallet_stripe_discrepancies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_account_id text not null,
  our_balance numeric(12,2) not null default 0,
  stripe_balance numeric(12,2) not null default 0,
  drift numeric(12,2) not null default 0,          -- our_balance - stripe_balance
  direction text not null check (direction in ('our_ahead', 'stripe_ahead')),
  detected_at timestamptz not null default now(),
  resolved boolean not null default false,
  resolved_at timestamptz,
  resolved_by text,
  resolution_note text
);

create unique index if not exists wallet_stripe_discrepancies_user_id_idx
  on wallet_stripe_discrepancies (user_id);

alter table wallet_stripe_discrepancies enable row level security;

-- Only service role can read/write
create policy "service role only" on wallet_stripe_discrepancies
  using (false)
  with check (false);
