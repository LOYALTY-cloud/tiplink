-- Add expires_at column to wallet_locks for lock timeouts
alter table if exists wallet_locks
add column if not exists expires_at timestamptz;

-- Backfill missing values to a short expiry window
update wallet_locks
set expires_at = now() + interval '30 seconds'
where expires_at is null;

-- Set a default so future inserts auto-expire
alter table if exists wallet_locks
alter column expires_at set default (now() + interval '30 seconds');

-- Ensure quick lookups by user
create index if not exists idx_wallet_locks_user
on wallet_locks(user_id);
