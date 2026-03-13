-- Drop subscription tier columns that are no longer used
-- All users now have the same 5% platform fee regardless of tier

alter table public.profiles
  drop column if exists subscription_tier;

alter table public.profiles
  drop column if exists is_paid;
