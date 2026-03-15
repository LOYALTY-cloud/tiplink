-- Create wallet_locks table to coordinate per-user wallet operations
create table if not exists wallet_locks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  lock_type text not null default 'withdrawal',
  resource_id uuid,
  acquired_at timestamptz default now(),
  expires_at timestamptz,
  constraint unique_user_lock unique(user_id, lock_type)
);

create index if not exists idx_wallet_locks_user on wallet_locks(user_id);

-- Optional: a small function to clean up expired locks could be added later
