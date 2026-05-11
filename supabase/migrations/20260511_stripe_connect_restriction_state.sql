-- Stripe Connect restriction + verification state tracking

alter table public.profiles
  add column if not exists stripe_restriction_state text not null default 'safe',
  add column if not exists stripe_verification_status text not null default 'pending',
  add column if not exists stripe_disabled_reason text,
  add column if not exists stripe_requirements_due_count integer not null default 0,
  add column if not exists stripe_future_requirements_due_count integer not null default 0,
  add column if not exists stripe_past_requirements_due_count integer not null default 0,
  add column if not exists stripe_connect_risk_reasons jsonb not null default '[]'::jsonb,
  add column if not exists stripe_connect_last_event_at timestamptz,
  add column if not exists stripe_connect_last_event_type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_stripe_restriction_state_check'
  ) then
    alter table public.profiles
      add constraint profiles_stripe_restriction_state_check
      check (stripe_restriction_state in ('safe', 'restricted', 'high_risk', 'disconnected'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'profiles_stripe_verification_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_stripe_verification_status_check
      check (stripe_verification_status in ('verified', 'pending', 'required', 'restricted', 'disconnected'));
  end if;
end $$;

create index if not exists profiles_stripe_restriction_state_idx
  on public.profiles(stripe_restriction_state);

comment on column public.profiles.stripe_restriction_state is 'Computed Stripe Connect safety state (safe/restricted/high_risk/disconnected).';
comment on column public.profiles.stripe_verification_status is 'Verification lifecycle state derived from Stripe requirements.';
comment on column public.profiles.stripe_disabled_reason is 'Latest Stripe disabled_reason value for operational triage.';
comment on column public.profiles.stripe_connect_risk_reasons is 'Machine reasons explaining Stripe restriction state transitions.';
comment on column public.profiles.stripe_connect_last_event_at is 'Timestamp of the most recent Stripe account status event processed.';
comment on column public.profiles.stripe_connect_last_event_type is 'Most recent Stripe event type used to update restriction state.';
