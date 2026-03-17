-- Refund tracking for blocked tips (e.g. tips to closed/suspended accounts)
alter table if exists tip_intents
add column if not exists needs_refund boolean default false;

alter table if exists tip_intents
add column if not exists failure_reason text;

-- Fast query: find all tips that need to be refunded
create index if not exists idx_tip_intents_refund
  on tip_intents (needs_refund, status);
