-- ============================================================
-- PATCH: Add missing columns to admin_tickets table
-- Run this in Supabase SQL Editor
-- ============================================================

ALTER TABLE public.admin_tickets
	ADD COLUMN IF NOT EXISTS from_role text NOT NULL DEFAULT 'admin',
	ADD COLUMN IF NOT EXISTS to_role text NOT NULL DEFAULT 'admin',
	ADD COLUMN IF NOT EXISTS auto_generated boolean NOT NULL DEFAULT false,
	ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
	ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

ALTER TABLE public.admin_tickets
	DROP CONSTRAINT IF EXISTS admin_tickets_type_check;

ALTER TABLE public.admin_tickets
	ADD CONSTRAINT admin_tickets_type_check
	CHECK (type IN ('warning', 'performance_review', 'policy_violation', 'escalation', 'note'));

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
	AND table_name = 'admin_tickets'
ORDER BY ordinal_position;