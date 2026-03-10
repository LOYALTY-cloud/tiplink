-- Alter admin_id foreign key to use ON DELETE RESTRICT.
-- This keeps `admin_id` nullable to avoid failing on existing NULLs;
-- it enforces that an admin with logged actions cannot be deleted.

begin;

-- drop prior FK if it exists (name may vary depending on how it was created)
alter table if exists public.stripe_onboard_admin_logs
  drop constraint if exists stripe_onboard_admin_logs_admin_fkey;

-- create new FK with ON DELETE RESTRICT
alter table if exists public.stripe_onboard_admin_logs
  add constraint stripe_onboard_admin_logs_admin_fkey
  foreign key (admin_id) references public.profiles(id) on delete restrict;

commit;

-- Note: if you prefer `admin_id` to be NOT NULL, add an
-- `ALTER TABLE ... ALTER COLUMN admin_id SET NOT NULL;` step
-- after you've verified there are no NULL `admin_id` values.
