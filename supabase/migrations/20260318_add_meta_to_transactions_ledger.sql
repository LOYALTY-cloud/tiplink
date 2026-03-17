-- Add meta jsonb column to transactions_ledger to store structured metadata
alter table if exists transactions_ledger
add column if not exists meta jsonb default '{}'::jsonb;
