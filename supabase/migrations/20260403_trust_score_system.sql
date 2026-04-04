-- ============================================================
-- TRUST SCORE SYSTEM + FRAUD SIGNALS + ESCALATION TRIGGERS
--
-- Adds:
--   1) trust_score, risk_level, last_risk_check columns to profiles
--   2) fraud_signals table for granular signal tracking
--   3) Withdrawal risk columns (risk_score, risk_level, release_at)
--   4) Override-spam trigger on admin_actions
-- ============================================================

-- §1 Add trust score columns to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS trust_score int DEFAULT 50,
ADD COLUMN IF NOT EXISTS last_risk_check timestamptz;

-- risk_level already exists on profiles from earlier migration;
-- ensure it has the right default
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'risk_level'
  ) THEN
    ALTER TABLE profiles ADD COLUMN risk_level text DEFAULT 'medium';
  END IF;
END $$;


-- §2 Fraud signals table (granular per-event scoring signals)
CREATE TABLE IF NOT EXISTS fraud_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(user_id) ON DELETE CASCADE,
  type text NOT NULL,
  weight int NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fraud_signals_user ON fraud_signals(user_id);
CREATE INDEX IF NOT EXISTS idx_fraud_signals_type ON fraud_signals(type);
CREATE INDEX IF NOT EXISTS idx_fraud_signals_created ON fraud_signals(created_at);

ALTER TABLE fraud_signals ENABLE ROW LEVEL SECURITY;

-- Service role only (fraud signals are written by backend)
DROP POLICY IF EXISTS "fraud_signals_service_only" ON fraud_signals;
CREATE POLICY "fraud_signals_service_only"
  ON fraud_signals FOR ALL
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON fraud_signals FROM anon, authenticated;


-- §3 Add risk columns to withdrawals table
ALTER TABLE withdrawals
ADD COLUMN IF NOT EXISTS risk_score int,
ADD COLUMN IF NOT EXISTS risk_level text,
ADD COLUMN IF NOT EXISTS release_at timestamptz;


-- §4 Override-spam detection trigger
-- Fires after each admin_actions INSERT and logs an anomaly
-- if the same admin performed 3+ admin_override actions in 10 min
CREATE OR REPLACE FUNCTION detect_override_spam()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cnt int;
BEGIN
  -- Only fire for admin_override action type
  IF NEW.action <> 'admin_override' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO cnt
  FROM admin_actions
  WHERE admin_id = NEW.admin_id
    AND action = 'admin_override'
    AND created_at > now() - interval '10 minutes';

  IF cnt >= 3 THEN
    INSERT INTO fraud_anomalies (
      user_id,
      type,
      score,
      decision,
      reason,
      flags,
      context
    )
    VALUES (
      NEW.admin_id,
      'admin_override_spam',
      95,
      'restrict',
      format('Admin %s performed %s overrides in 10 min', NEW.admin_id::text, cnt),
      ARRAY['admin_override_spam'],
      jsonb_build_object('count', cnt, 'admin_id', NEW.admin_id, 'latest_target', NEW.target_user)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS override_spam_trigger ON admin_actions;
CREATE TRIGGER override_spam_trigger
  AFTER INSERT ON admin_actions
  FOR EACH ROW EXECUTE FUNCTION detect_override_spam();
