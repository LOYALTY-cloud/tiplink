-- Expand admins.role check constraint to include all defined roles.
-- Previously only 'admin' and 'owner' were allowed.

ALTER TABLE public.admins
  DROP CONSTRAINT IF EXISTS admins_role_check;

ALTER TABLE public.admins
  ADD CONSTRAINT admins_role_check
  CHECK (role IN ('owner', 'super_admin', 'finance_admin', 'support_admin', 'moderator', 'admin'));

COMMENT ON COLUMN public.admins.role IS 'Admin role: owner > super_admin > finance_admin / support_admin / moderator > admin';
