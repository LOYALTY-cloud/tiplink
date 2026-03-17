-- Add Stripe payment intent id column to tip_intents for webhook updates
alter table if exists tip_intents
add column if not exists stripe_payment_intent_id text;

-- Ensure receipt_id is text (safe no-op if already text)
alter table if exists tip_intents
alter column receipt_id type text using receipt_id::text;
