-- Admin assignments log
-- Tracks every time an admin role is granted or revoked, and by whom.

CREATE TABLE IF NOT EXISTS public.admin_assignments (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL,
  full_name        text,
  email            text,
  role             text        NOT NULL,
  action           text        NOT NULL CHECK (action IN ('assigned', 'removed', 'role_changed')),
  performed_by     uuid,
  performed_by_name text,
  reason           text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_assignments_user_id    ON public.admin_assignments (user_id);
CREATE INDEX IF NOT EXISTS idx_admin_assignments_performed  ON public.admin_assignments (performed_by);
CREATE INDEX IF NOT EXISTS idx_admin_assignments_created_at ON public.admin_assignments (created_at DESC);

-- Service role only
ALTER TABLE public.admin_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_assignments FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_assignments FROM anon, authenticated;

-- Backfill from existing admin_actions (best-effort — no performed_by_name)
INSERT INTO public.admin_assignments (user_id, role, action, performed_by, reason, created_at)
SELECT
  aa.target_user                               AS user_id,
  COALESCE(aa.metadata->>'role_assigned', 'unknown') AS role,
  'assigned'                                   AS action,
  aa.admin_id                                  AS performed_by,
  'Backfilled from admin_actions'              AS reason,
  aa.created_at
FROM public.admin_actions aa
WHERE aa.action = 'create_admin'
  AND aa.target_user IS NOT NULL
ON CONFLICT DO NOTHING;
