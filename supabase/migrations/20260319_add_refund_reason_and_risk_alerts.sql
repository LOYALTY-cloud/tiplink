-- Add reason and note columns to refund_requests
ALTER TABLE refund_requests
ADD COLUMN IF NOT EXISTS reason text,
ADD COLUMN IF NOT EXISTS note text;

-- Risk alerts table for automated risk detection
CREATE TABLE IF NOT EXISTS risk_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  message text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),

  CONSTRAINT risk_alerts_severity_check CHECK (severity IN ('info', 'warning', 'critical'))
);

-- Ensure resolved column exists (handles table created without it)
ALTER TABLE risk_alerts ADD COLUMN IF NOT EXISTS resolved boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_risk_alerts_user ON risk_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_risk_alerts_unresolved ON risk_alerts(resolved, created_at DESC) WHERE resolved = false;
