-- Payout timeline fields for trust-focused status tracking UI

alter table public.payout_requests
add column if not exists requested_at timestamptz default now(),
add column if not exists processed_at timestamptz,
add column if not exists paid_at timestamptz,
add column if not exists receipt_url text;

-- Backfill requested_at for legacy rows so timeline has a stable first step timestamp.
update public.payout_requests
set requested_at = coalesce(requested_at, created_at, now())
where requested_at is null;
