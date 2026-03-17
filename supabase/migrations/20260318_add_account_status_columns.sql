-- Add account status fields to profiles
alter table if exists profiles
add column if not exists account_status text default 'active';

alter table if exists profiles
add column if not exists status_reason text;

alter table if exists profiles
add column if not exists closed_at timestamptz;

-- Note: admin access is controlled via the existing `role` column (role = 'admin')
