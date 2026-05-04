-- Ledger anomaly tracking table for the ledger-audit cron job.
-- Records wallet/ledger mismatches for admin review.

create table if not exists public.ledger_anomalies (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id),
  wallet_balance numeric not null,
  ledger_sum numeric not null,
  drift numeric not null,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  notes text
);

create index if not exists idx_ledger_anomalies_user_id on public.ledger_anomalies(user_id);
create index if not exists idx_ledger_anomalies_detected_at on public.ledger_anomalies(detected_at);

-- Optional: RPC helper for fast per-user ledger sum (avoids client-side row scan)
create or replace function public.sum_ledger_balance(p_user_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(amount), 0) from public.transactions_ledger where user_id = p_user_id;
$$;
