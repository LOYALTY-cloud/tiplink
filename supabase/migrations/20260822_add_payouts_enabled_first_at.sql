alter table public.profiles
  add column if not exists payouts_enabled_first_at timestamptz;

comment on column public.profiles.payouts_enabled_first_at is
  'First time Stripe enabled both charges and payouts. Preserved to distinguish initial onboarding from later restrictions.';

update public.profiles
set payouts_enabled_first_at = coalesce(
  payouts_enabled_at,
  stripe_last_synced_at,
  created_at,
  now()
)
where payouts_enabled_first_at is null
  and (
    stripe_onboarding_complete is true
    or (stripe_charges_enabled is true and stripe_payouts_enabled is true)
    or payouts_enabled_at is not null
  );