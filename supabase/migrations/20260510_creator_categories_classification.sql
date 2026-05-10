-- Canonical creator classification for Stripe onboarding, risk controls, and payouts.
create table if not exists public.creator_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  group_name text not null,
  stripe_description text not null,
  risk_level text not null check (risk_level in ('low', 'medium', 'high')),
  payout_delay_days integer not null default 3 check (payout_delay_days >= 0 and payout_delay_days <= 30),
  requires_manual_review boolean not null default false
);

insert into public.creator_categories (
  name,
  group_name,
  stripe_description,
  risk_level,
  payout_delay_days,
  requires_manual_review
)
values
  ('Music Artist', 'Creator & Entertainment', 'Creator receives fan support and monetization payments for music content and entertainment through the 1neLink platform.', 'low', 3, false),
  ('DJ', 'Creator & Entertainment', 'Creator receives fan support and monetization payments for DJ and music entertainment services through the 1neLink platform.', 'low', 3, false),
  ('Streamer', 'Creator & Entertainment', 'Creator monetizes livestream and entertainment content through fan support on the 1neLink platform.', 'low', 3, false),
  ('Influencer', 'Creator & Entertainment', 'Creator receives fan support and monetization payments for social media and audience engagement through the 1neLink platform.', 'low', 3, false),
  ('Podcaster', 'Creator & Entertainment', 'Creator monetizes podcast and audio entertainment content through the 1neLink platform.', 'low', 3, false),
  ('Content Creator', 'Creator & Entertainment', 'Creator monetizes original digital content and audience engagement through the 1neLink platform.', 'low', 3, false),
  ('Dancer', 'Creator & Entertainment', 'Creator receives fan support and monetization payments for dance and entertainment content through the 1neLink platform.', 'low', 3, false),
  ('Comedian', 'Creator & Entertainment', 'Creator monetizes comedy and entertainment content through audience support on the 1neLink platform.', 'low', 3, false),
  ('Cook/Chef', 'Services & Hospitality', 'Creator receives customer support and monetization payments related to food content and hospitality services through the 1neLink platform.', 'low', 3, false),
  ('Waiter/Server', 'Services & Hospitality', 'Creator receives customer tips and support payments through the 1neLink platform.', 'low', 3, false),
  ('Bartender', 'Services & Hospitality', 'Creator receives customer tips and audience support through the 1neLink platform.', 'low', 3, false),
  ('Barber', 'Services & Hospitality', 'Creator monetizes barbering services, content, and audience support through the 1neLink platform.', 'low', 3, false),
  ('Makeup Artist', 'Services & Hospitality', 'Creator monetizes beauty content, services, and audience engagement through the 1neLink platform.', 'low', 3, false),
  ('Nail Technician', 'Services & Hospitality', 'Creator monetizes nail art services and audience engagement through the 1neLink platform.', 'low', 3, false),
  ('Photographer', 'Services & Hospitality', 'Creator monetizes photography content and audience support through the 1neLink platform.', 'medium', 3, false),
  ('Theme Designer', 'Digital Creators', 'Creator sells downloadable profile customization themes and creator assets through the 1neLink platform.', 'high', 7, true),
  ('Graphic Designer', 'Digital Creators', 'Creator monetizes original graphic design content and creator assets through the 1neLink platform.', 'medium', 3, false),
  ('Digital Artist', 'Digital Creators', 'Creator monetizes digital artwork and audience engagement through the 1neLink platform.', 'medium', 3, false),
  ('UI Creator', 'Digital Creators', 'Creator sells digital UI customization assets and creator tools through the 1neLink platform.', 'high', 7, true),
  ('Video Editor', 'Digital Creators', 'Creator monetizes video editing services and digital content through the 1neLink platform.', 'medium', 3, false),
  ('Tutor', 'Education & Coaching', 'Creator monetizes educational content and tutoring support through the 1neLink platform.', 'low', 3, false),
  ('Fitness Coach', 'Education & Coaching', 'Creator monetizes fitness coaching content and audience engagement through the 1neLink platform.', 'low', 3, false),
  ('Mentor', 'Education & Coaching', 'Creator monetizes mentorship and educational support through the 1neLink platform.', 'low', 3, false),
  ('Educator', 'Education & Coaching', 'Creator monetizes educational and instructional content through the 1neLink platform.', 'low', 3, false)
on conflict (name) do update
set
  group_name = excluded.group_name,
  stripe_description = excluded.stripe_description,
  risk_level = excluded.risk_level,
  payout_delay_days = excluded.payout_delay_days,
  requires_manual_review = excluded.requires_manual_review;

-- Migrate legacy category keys to canonical category names.
update public.profiles
set creator_activity_category = case creator_activity_category
  when 'creator_tips' then 'Content Creator'
  when 'digital_creator_content' then 'Content Creator'
  when 'profile_themes' then 'Theme Designer'
  when 'graphic_assets' then 'Graphic Designer'
  when 'educational_content' then 'Educator'
  when 'streaming_entertainment' then 'Streamer'
  when 'social_creator' then 'Influencer'
  else creator_activity_category
end
where creator_activity_category is not null;

-- Remove invalid values so foreign key can be enforced safely.
update public.profiles p
set creator_activity_category = null
where p.creator_activity_category is not null
  and not exists (
    select 1
    from public.creator_categories c
    where c.name = p.creator_activity_category
  );

alter table public.profiles
  drop constraint if exists profiles_creator_activity_category_check;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_creator_activity_category_fk'
  ) then
    alter table public.profiles
      add constraint profiles_creator_activity_category_fk
      foreign key (creator_activity_category)
      references public.creator_categories(name)
      on update cascade
      on delete set null;
  end if;
end $$;

create index if not exists idx_profiles_creator_activity_category
  on public.profiles (creator_activity_category)
  where creator_activity_category is not null;

comment on table public.creator_categories is 'Canonical creator classification for Stripe descriptions, payout risk controls, and moderation signals.';
comment on column public.creator_categories.risk_level is 'Category-level baseline risk for payout and moderation policy decisions.';
comment on column public.creator_categories.payout_delay_days is 'Minimum payout delay floor for creators in this category.';
comment on column public.creator_categories.requires_manual_review is 'If true, elevated withdrawal review rules can trigger manual review.';
