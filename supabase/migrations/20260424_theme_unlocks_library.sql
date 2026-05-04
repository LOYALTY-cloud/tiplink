-- Add asset-library columns to theme_unlocks
alter table theme_unlocks
  add column if not exists is_favorite boolean not null default false,
  add column if not exists last_used_at timestamptz;

comment on column theme_unlocks.is_favorite is 'User starred this theme for quick access';
comment on column theme_unlocks.last_used_at is 'Timestamp of most recent Apply action';
