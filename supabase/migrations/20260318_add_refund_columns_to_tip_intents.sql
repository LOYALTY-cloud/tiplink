-- Refund tracking columns on tip_intents
alter table if exists tip_intents
add column if not exists refunded_amount numeric default 0;

-- none = not refunded, partial = partially refunded, full = fully refunded, initiated = admin triggered, awaiting webhook
alter table if exists tip_intents
add column if not exists refund_status text default 'none';

alter table if exists tip_intents
add column if not exists last_refund_id text;

-- Index: find all initiated/pending refunds quickly (used by withdrawal protection)
create index if not exists idx_tip_intents_refund_status
  on tip_intents (creator_user_id, refund_status)
  where refund_status = 'initiated';
