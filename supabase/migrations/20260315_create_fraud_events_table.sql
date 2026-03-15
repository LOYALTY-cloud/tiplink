-- Create fraud_events table to record automated protections and blocks
create table if not exists fraud_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  ip text,
  type text,
  reason text,
  created_at timestamptz default now()
);

create index if not exists idx_fraud_events_user
on fraud_events(user_id);

create index if not exists idx_fraud_events_ip
on fraud_events(ip);
