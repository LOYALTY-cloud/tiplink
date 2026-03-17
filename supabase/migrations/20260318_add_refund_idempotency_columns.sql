-- Per-refund-id idempotency to prevent double debits on Stripe webhook retries
alter table if exists tip_intents
add column if not exists processed_refund_ids text[] default '{}';

-- Timestamp for the initiated gap so stale initiated rows expire from withdrawal guard
alter table if exists tip_intents
add column if not exists refund_initiated_at timestamptz;
