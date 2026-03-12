-- Add Stripe Connect and subscription columns to profiles table

alter table if exists profiles
  add column if not exists stripe_account_id text unique,
  add column if not exists subscription_tier text default 'free' check (subscription_tier in ('free', 'pro')),
  add column if not exists stripe_charges_enabled boolean default false,
  add column if not exists stripe_payouts_enabled boolean default false,
  add column if not exists stripe_onboarding_complete boolean default false,
  add column if not exists stripe_onboarded_at timestamp with time zone;

-- Add index for faster lookups
create index if not exists profiles_stripe_account_id_idx on profiles(stripe_account_id);
