-- Create tip_intents table to store pre-stripe intent records
create table if not exists tip_intents (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null,
  tipper_name text,
  amount numeric not null,
  receipt_id text unique,
  stripe_payment_intent_id text,
  status text default 'pending',
  note text,
  created_at timestamptz default now()
);

create index if not exists idx_tip_intents_creator
on tip_intents(creator_user_id);
