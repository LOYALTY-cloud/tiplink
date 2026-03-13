-- COPY AND PASTE THIS INTO YOUR SUPABASE SQL EDITOR
-- Go to: https://supabase.com/dashboard/project/YOUR_PROJECT/sql/new

-- Add Stripe Connect columns to profiles table
alter table public.profiles
add column if not exists stripe_account_id text;

alter table public.profiles
add column if not exists payouts_enabled boolean not null default false;

alter table public.profiles
add column if not exists payouts_enabled_at timestamptz;

-- Index for looking up by stripe account ID
create index if not exists profiles_stripe_account_id_idx 
  on public.profiles(stripe_account_id);

-- Comments for documentation
comment on column public.profiles.stripe_account_id is 'Stripe Express Connect account ID';
comment on column public.profiles.payouts_enabled is 'Whether the creator can receive payouts';
comment on column public.profiles.payouts_enabled_at is 'When payouts were first enabled';

-- ✅ After running this, the "Connect now" button will work!
