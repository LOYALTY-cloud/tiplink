-- Add balance column to wallets and populate from transactions_ledger

alter table if exists public.wallets
add column if not exists balance numeric default 0;

-- Populate balances from ledger (run once)
update public.wallets w
set balance = coalesce(sub.total, 0)
from (
  select user_id, sum(amount) as total
  from public.transactions_ledger
  group by user_id
) sub
where w.user_id = sub.user_id;
