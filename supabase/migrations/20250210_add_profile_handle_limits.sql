alter table if exists profiles
  add column if not exists is_paid boolean default false,
  add column if not exists handle_change_count integer default 0,
  add column if not exists handle_change_window_start timestamptz;
