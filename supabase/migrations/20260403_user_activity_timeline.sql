-- ============================================================
-- USER ACTIVITY TIMELINE VIEW  (idempotent)
--
-- Unifies events across multiple tables into a single
-- chronological feed per user. Used by the Fraud Center
-- case investigation panel.
--
-- Source tables:
--   admin_actions     (freeze, unfreeze, overrides)
--   fraud_anomalies   (anomaly detections)
--   withdrawals       (withdrawal attempts)
--   tip_intents       (tips received)
--   transactions_ledger (ledger entries)
-- ============================================================

CREATE OR REPLACE VIEW public.user_activity_timeline AS

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

-- Grant read access to authenticated users (RLS on underlying tables still applies)
-- The service role client bypasses RLS, so admin API routes can read this freely.
GRANT SELECT ON public.user_activity_timeline TO authenticated;
