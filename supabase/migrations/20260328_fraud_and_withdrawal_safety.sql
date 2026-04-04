-- Fraud detection & withdrawal safety system
-- Add risk scoring columns to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS risk_score int DEFAULT 0;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS risk_level text DEFAULT 'low';

-- Withdrawal safety columns
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS withdrawal_locked boolean DEFAULT false;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS payout_hold_until timestamptz;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS daily_withdrawn numeric DEFAULT 0;

-- Track scored fraud events (extends existing fraud_events table)
ALTER TABLE fraud_events
ADD COLUMN IF NOT EXISTS score int DEFAULT 0;

ALTER TABLE fraud_events
ADD COLUMN IF NOT EXISTS meta jsonb DEFAULT '{}'::jsonb;

-- Index for risk queries
CREATE INDEX IF NOT EXISTS idx_fraud_events_user_id ON fraud_events(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_risk_level ON profiles(risk_level) WHERE risk_level != 'low';

-- Auto risk level function
CREATE OR REPLACE FUNCTION increment_risk_score(uid uuid, delta int)
RETURNS void AS $$
BEGIN
  UPDATE profiles
  SET risk_score = COALESCE(risk_score, 0) + delta,
      risk_level = CASE
        WHEN COALESCE(risk_score, 0) + delta >= 80 THEN 'high'
        WHEN COALESCE(risk_score, 0) + delta >= 40 THEN 'medium'
        ELSE 'low'
      END
  WHERE id = uid OR user_id = uid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment daily withdrawn tracker
CREATE OR REPLACE FUNCTION increment_daily_withdrawn(uid uuid, amt numeric)
RETURNS void AS $$
BEGIN
  UPDATE profiles
  SET daily_withdrawn = COALESCE(daily_withdrawn, 0) + amt
  WHERE id = uid OR user_id = uid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reset daily_withdrawn at midnight (call via cron or scheduled job)
CREATE OR REPLACE FUNCTION reset_daily_withdrawn()
RETURNS void AS $$
BEGIN
  UPDATE profiles SET daily_withdrawn = 0 WHERE daily_withdrawn > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
