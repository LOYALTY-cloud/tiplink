-- Fraud score history tracking + soft restrictions + admin override tracking
-- 2026-03-29

-- 1. Add last_fraud_score and last_flagged_at to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_fraud_score INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_flagged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_required BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS verification_reason TEXT;

-- 2. Fraud score history table for trend tracking
CREATE TABLE IF NOT EXISTS fraud_score_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  score INT NOT NULL CHECK (score >= 0 AND score <= 100),
  level TEXT NOT NULL CHECK (level IN ('low', 'medium', 'high')),
  patterns JSONB DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'timeline_analysis',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fraud_score_history_user
  ON fraud_score_history(user_id, created_at DESC);

-- 3. Admin override tracking table
CREATE TABLE IF NOT EXISTS admin_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL,
  target_user UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  override_type TEXT NOT NULL CHECK (override_type IN (
    'unflag', 'clear_restriction', 'bypass_verification',
    'override_risk_score', 'unlock_withdrawal', 'manual_flag'
  )),
  previous_value JSONB,
  new_value JSONB,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_overrides_target
  ON admin_overrides(target_user, created_at DESC);

-- 4. Real-time alerts table
CREATE TABLE IF NOT EXISTS fraud_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'high_risk_score', 'rapid_score_increase', 'repeat_flag',
    'verification_bypass_attempt', 'suspicious_session'
  )),
  severity TEXT NOT NULL DEFAULT 'high' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by UUID,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fraud_alerts_unacked
  ON fraud_alerts(acknowledged, created_at DESC)
  WHERE acknowledged = FALSE;

-- 5. RLS policies
ALTER TABLE fraud_score_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_alerts ENABLE ROW LEVEL SECURITY;

-- Service role only
CREATE POLICY "Service role full access on fraud_score_history"
  ON fraud_score_history FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on admin_overrides"
  ON admin_overrides FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on fraud_alerts"
  ON fraud_alerts FOR ALL
  USING (auth.role() = 'service_role');

-- 6. Permanent daily event snapshots for historical calendar
CREATE TABLE IF NOT EXISTS daily_event_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  events JSONB NOT NULL DEFAULT '[]',
  summary JSONB DEFAULT '{}',
  fraud_score INT DEFAULT 0 CHECK (fraud_score >= 0 AND fraud_score <= 100),
  risk_level TEXT DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_event_snapshots_user
  ON daily_event_snapshots(user_id, date DESC);

ALTER TABLE daily_event_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on daily_event_snapshots"
  ON daily_event_snapshots FOR ALL
  USING (auth.role() = 'service_role');
