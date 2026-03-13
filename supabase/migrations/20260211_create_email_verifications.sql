create table if not exists email_verifications (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  user_id uuid,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists email_verifications_email_idx
  on email_verifications (email);

alter table email_verifications enable row level security;

alter table if exists profiles
  add column if not exists email_verified boolean default false;
