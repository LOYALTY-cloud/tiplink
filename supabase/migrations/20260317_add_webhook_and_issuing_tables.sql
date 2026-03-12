-- Create table to record processed Stripe webhook events for deduplication
create table if not exists stripe_webhook_events (
  id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);

-- Logs for issuing authorization attempts and reasons
create table if not exists issuing_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  stripe_authorization_id text not null,
  amount numeric not null,
  approved boolean not null,
  reason text,
  created_at timestamptz default now()
);

-- Track declines for fraud monitoring and auto-freeze logic
create table if not exists card_declines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  stripe_authorization_id text,
  reason text,
  created_at timestamptz default now()
);
