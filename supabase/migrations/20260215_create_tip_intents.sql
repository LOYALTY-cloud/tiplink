-- Create tip_intents table for tracking payment intents before they complete
-- This is for audit and to guarantee receipt ID generation before payment

create table if not exists public.tip_intents (
  receipt_id uuid primary key,
  payment_intent_id text unique,
  creator_user_id uuid not null references auth.users(id),
  tip_amount numeric(12,2) not null,
  stripe_fee numeric(12,2) not null,
  platform_fee numeric(12,2) not null,
  total_charge numeric(12,2) not null,
  note text,
  status text not null default 'created',
  created_at timestamptz not null default now()
);

-- Index for looking up by payment intent
create index if not exists tip_intents_payment_intent_id_idx 
  on public.tip_intents(payment_intent_id);

-- Index for creator queries
create index if not exists tip_intents_creator_user_id_idx 
  on public.tip_intents(creator_user_id);

-- Comment
comment on table public.tip_intents is 'Tracks payment intents for tips - created before payment completes';
