-- Add index to speed up transaction queries by user + created_at desc
create index if not exists idx_ledger_user_created
on transactions_ledger(user_id, created_at desc);
