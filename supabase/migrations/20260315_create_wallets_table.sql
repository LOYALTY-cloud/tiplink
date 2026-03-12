-- Create wallets table
create table if not exists wallets (
  id uuid primary key default gen_random_uuid(),

  user_id uuid unique not null references profiles(id) on delete cascade,

  balance numeric default 0,
  available numeric default 0,
  pending numeric default 0,

  currency text default 'usd',

  created_at timestamptz default now()
);

create index if not exists idx_wallets_user_id on wallets(user_id);
