-- Add Stripe payment intent tracking and receipt ID to tips table

alter table public.tips
  add column if not exists stripe_payment_intent_id text,
  add column if not exists receipt_id text;

-- Create unique indexes to prevent duplicate payments
create unique index if not exists uniq_tips_pi on public.tips(stripe_payment_intent_id);
create unique index if not exists uniq_tips_receipt on public.tips(receipt_id);
