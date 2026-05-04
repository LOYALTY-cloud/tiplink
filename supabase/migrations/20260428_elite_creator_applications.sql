-- Elite creator applications (separate from theme creator_applications)
-- Stores multi-step application answers from /elitecreator.

create table if not exists public.elite_creator_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text,
  email text,

  creator_type text,
  experience text,
  work text,

  portfolio text,
  intent text,

  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz
);

create index if not exists idx_elite_creator_applications_status_created
  on public.elite_creator_applications (status, created_at desc);

alter table public.elite_creator_applications enable row level security;

-- Applicant can submit their own row.
create policy "elite_creator_applications: insert own"
  on public.elite_creator_applications
  for insert
  with check (auth.uid() = user_id);

-- Applicant can read their own status.
create policy "elite_creator_applications: select own"
  on public.elite_creator_applications
  for select
  using (auth.uid() = user_id);

comment on table public.elite_creator_applications is
  'Applications submitted from /elitecreator. Reviewed by admins to unlock creator access.';

comment on column public.elite_creator_applications.user_id is
  'Auth user id for strict application-to-account linkage.';