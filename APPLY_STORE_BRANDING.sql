-- Store branding: avatar + banner
alter table creator_stores
  add column if not exists avatar_url text,
  add column if not exists banner_url text;
