-- Add fraud flag column to profiles for manual account restriction
alter table if exists profiles
add column if not exists is_flagged boolean default false;
