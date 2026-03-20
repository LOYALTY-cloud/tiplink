-- Add severity level to admin action logs
ALTER TABLE admin_actions
ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'info'
CHECK (severity IN ('info', 'warning', 'critical'));
