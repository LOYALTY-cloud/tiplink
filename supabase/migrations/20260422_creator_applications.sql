-- Creator application system
-- Controlled onboarding: apply → admin review → approved → is_creator unlocked

-- ── 1. profiles: creator flag + tier ─────────────────────────────────────────

alter table public.profiles
  add column if not exists is_creator    boolean     not null default false,
  add column if not exists creator_tier  text        check (creator_tier in ('basic', 'pro', 'partner'));

comment on column public.profiles.is_creator   is 'TRUE once an admin approves the creator application.';
comment on column public.profiles.creator_tier is 'null = not a creator | basic | pro | partner';

create index if not exists idx_profiles_is_creator
  on public.profiles (is_creator) where is_creator = true;

-- ── 2. creator_applications ───────────────────────────────────────────────────

create table if not exists public.creator_applications (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null unique references auth.users(id) on delete cascade,
  username        text,
  social_links    text,
  description     text,
  audience_size   int,
  status          text        not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  review_notes    text,
  reviewed_by     uuid        references auth.users(id),
  created_at      timestamptz not null default now(),
  reviewed_at     timestamptz
);

create index if not exists idx_creator_applications_status
  on public.creator_applications (status, created_at desc);

alter table public.creator_applications enable row level security;

-- Users can read their own application
create policy "creator_applications: select own"
  on public.creator_applications for select
  using (auth.uid() = user_id);

-- Users can insert their own (enforced by unique(user_id); duplicates blocked at API)
create policy "creator_applications: insert own"
  on public.creator_applications for insert
  with check (auth.uid() = user_id);

comment on table  public.creator_applications              is 'Creator onboarding applications. Reviewed by admins before is_creator is set.';
comment on column public.creator_applications.review_notes is 'Admin-visible notes or rejection reason shown to the creator.';
