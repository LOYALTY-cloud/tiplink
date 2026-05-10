-- Stripe Connect stabilization: creator intake + verification reminder dedupe

alter table public.profiles
  add column if not exists creator_activity_category text,
  add column if not exists last_stripe_requirements_hash text,
  add column if not exists last_stripe_requirements_notified_at timestamptz;

-- Restrict creator activity values to standardized onboarding categories.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_creator_activity_category_check'
  ) then
    alter table public.profiles
      add constraint profiles_creator_activity_category_check
      check (
        creator_activity_category is null
        or creator_activity_category in (
          'creator_tips',
          'digital_creator_content',
          'profile_themes',
          'graphic_assets',
          'educational_content',
          'streaming_entertainment',
          'social_creator'
        )
      );
  end if;
end $$;

comment on column public.profiles.creator_activity_category is 'Standardized onboarding creator activity category for Stripe Connect profile descriptions.';
comment on column public.profiles.last_stripe_requirements_hash is 'Last currently_due requirements signature that triggered creator verification reminders.';
comment on column public.profiles.last_stripe_requirements_notified_at is 'Timestamp of the last verification reminder sent for requirements signature dedupe.';
