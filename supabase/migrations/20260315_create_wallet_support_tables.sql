-- Wallet locks
create table if not exists wallet_locks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  locked_amount numeric,
  reason text,
  created_at timestamptz default now()
);

create index if not exists idx_wallet_locks_user on wallet_locks(user_id);

-- Card transactions (platform-side copy)
create table if not exists card_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  stripe_authorization_id text,
  merchant_name text,
  amount numeric,
  currency text,
  status text,
  created_at timestamptz default now()
);

create index if not exists idx_card_tx_user on card_transactions(user_id);

-- Card declines for fraud detection
create table if not exists card_declines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  card_id text,
  reason text,
  created_at timestamptz default now()
);

create index if not exists idx_card_declines_user on card_declines(user_id);
