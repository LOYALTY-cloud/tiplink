-- Add metadata column to admin_notifications.
-- Required for AI alerts (cause, actions) and security alerts to store structured data.
-- Without this column, createAdminNotification() silently fails on any notification
-- that includes a metadata payload.

ALTER TABLE public.admin_notifications
  ADD COLUMN IF NOT EXISTS metadata jsonb;

CREATE INDEX IF NOT EXISTS idx_admin_notifications_metadata
  ON public.admin_notifications USING gin (metadata)
  WHERE metadata IS NOT NULL;

-- Ensure the owner user has a row in the admins table.
-- The notifications API returns empty [] if no admins row exists for the caller.
INSERT INTO public.admins (user_id, full_name, role, status)
VALUES ('49593d9b-3b4d-4425-98a9-fb67fcd97c90', 'Admin Owner', 'owner', 'active')
ON CONFLICT (user_id) DO NOTHING;
