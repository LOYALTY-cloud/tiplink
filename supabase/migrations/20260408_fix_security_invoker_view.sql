-- ============================================================
-- FIX: Recreate user_activity_timeline with SECURITY INVOKER
-- (idempotent — safe to re-run)
--
-- Resolves Supabase Security Advisor warning:
--   "View public.user_activity_timeline is defined with the
--    SECURITY DEFINER property"
--
-- By default PostgreSQL views run as the view OWNER (definer),
-- which bypasses RLS on the underlying tables. Adding
-- security_invoker = true makes the view respect the
-- querying user's RLS policies instead.
--
-- Since admin routes use supabaseAdmin (service_role) which
-- bypasses RLS anyway, this change is transparent to the app.
-- ============================================================

DROP VIEW IF EXISTS public.user_activity_timeline;

CREATE VIEW public.user_activity_timeline
WITH (security_invoker = true)
AS

-- Admin actions targeting a user
SELECT
  target_user AS user_id,
  action AS type,
  created_at,
  jsonb_build_object(
    'admin_id', admin_id,
    'source', 'admin_actions'
  ) || COALESCE(metadata, '{}'::jsonb) AS metadata
FROM admin_actions
WHERE target_user IS NOT NULL

UNION ALL

-- Fraud anomaly detections
SELECT
  user_id,
  'anomaly_' || type AS type,
  created_at,
  jsonb_build_object(
    'score', score,
    'decision', decision,
    'reason', reason,
    'source', 'fraud_anomalies'
  ) AS metadata
FROM fraud_anomalies
WHERE user_id IS NOT NULL

UNION ALL

-- Withdrawals
SELECT
  user_id,
  'withdrawal' AS type,
  created_at,
  jsonb_build_object(
    'amount', amount,
    'status', status,
    'risk_level', risk_level,
    'source', 'withdrawals'
  ) AS metadata
FROM withdrawals

UNION ALL

-- Tips received
SELECT
  creator_user_id AS user_id,
  'tip_received' AS type,
  created_at,
  jsonb_build_object(
    'amount', tip_amount,
    'status', status,
    'source', 'tip_intents'
  ) AS metadata
FROM tip_intents;

-- Re-grant read access
GRANT SELECT ON public.user_activity_timeline TO authenticated;
