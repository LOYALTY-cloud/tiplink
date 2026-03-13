-- Add Stripe payout tracking columns to withdrawals table

alter table public.withdrawals
  add column if not exists stripe_payout_id text,
  add column if not exists payout_method text;
