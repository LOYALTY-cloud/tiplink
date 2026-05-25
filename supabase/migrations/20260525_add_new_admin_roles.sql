-- Add new admin roles: co_owner, security, compliance, analyst
-- co_owner = full access minus payroll/manage_staff/Owner AI
-- security  = logs, activity, fraud visibility, security dashboard
-- compliance = DMCA, disputes, fraud review, verifications
-- analyst   = read-only revenue & analytics

-- ── 1. profiles.role check constraint ────────────────────────────────────────
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'owner',
    'co_owner',
    'super_admin',
    'security',
    'finance_admin',
    'support_admin',
    'compliance',
    'moderator',
    'analyst',
    'user',
    'system'
  ));

-- ── 2. admins.role check constraint ──────────────────────────────────────────
ALTER TABLE public.admins
  DROP CONSTRAINT IF EXISTS admins_role_check;

ALTER TABLE public.admins
  ADD CONSTRAINT admins_role_check
  CHECK (role IN (
    'owner',
    'co_owner',
    'super_admin',
    'security',
    'finance_admin',
    'support_admin',
    'compliance',
    'moderator',
    'analyst',
    'admin'
  ));

COMMENT ON COLUMN public.admins.role IS
  'Admin role hierarchy: owner > co_owner > super_admin > security / finance_admin / support_admin / compliance / moderator / analyst > admin';
