-- COPY AND PASTE THIS INTO YOUR SUPABASE SQL EDITOR
-- Go to: https://supabase.com/dashboard/project/YOUR_PROJECT/sql/new
-- This combines all 3 pending migrations from 2026-03-28

-- ============================================================
-- 1. FRAUD DETECTION & WITHDRAWAL SAFETY
-- ============================================================

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

-- ============================================================
-- 2. RESTRICTED_UNTIL & RESTRICTION_COUNT
-- ============================================================

-- Add restricted_until for time-based auto-unlock
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS restricted_until timestamptz;

-- Track repeat restriction count for escalation
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS restriction_count int DEFAULT 0;

-- Index for efficient auto-unlock queries
CREATE INDEX IF NOT EXISTS idx_profiles_restricted_until
  ON profiles(restricted_until) WHERE restricted_until IS NOT NULL;

-- ============================================================
-- 3. IDENTITY VERIFICATION (KYC-LITE)
-- ============================================================

-- Verification submissions table
CREATE TABLE IF NOT EXISTS identity_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,

  status text NOT NULL DEFAULT 'pending',  -- pending / approved / rejected
  document_url text NOT NULL,
  document_back_url text,                  -- optional back of ID
  document_type text NOT NULL,             -- id_card / passport / driver_license

  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid,

  rejection_reason text,

  CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT valid_doc_type CHECK (document_type IN ('id_card', 'passport', 'driver_license'))
);

CREATE INDEX IF NOT EXISTS idx_identity_verifications_user ON identity_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_identity_verifications_status ON identity_verifications(status) WHERE status = 'pending';

-- Track verification status on profile for quick lookups
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS kyc_status text DEFAULT 'none';
-- none / pending / approved / rejected

-- RLS: users can only read their own verifications
ALTER TABLE identity_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own verifications" ON identity_verifications;
CREATE POLICY "Users can view own verifications"
  ON identity_verifications FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access" ON identity_verifications;
CREATE POLICY "Service role full access"
  ON identity_verifications FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- 4. OCR VERIFICATION & PRIVATE DOCUMENT STORAGE
-- ============================================================

-- OCR extracted data + match score
ALTER TABLE identity_verifications
ADD COLUMN IF NOT EXISTS ocr_data jsonb;

ALTER TABLE identity_verifications
ADD COLUMN IF NOT EXISTS match_score int;

-- Store private storage paths for signed URL generation
ALTER TABLE identity_verifications
ADD COLUMN IF NOT EXISTS document_path text;

ALTER TABLE identity_verifications
ADD COLUMN IF NOT EXISTS document_back_path text;

-- Track active verification (prevent spam uploads)
ALTER TABLE identity_verifications
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Add DOB + full_name to profiles for identity matching
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS dob text;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS full_name text;

-- Verified badge flag
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false;

-- Daily upload count tracker for rate limiting OCR
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS verification_uploads_today int DEFAULT 0;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS verification_uploads_date date;

-- Index for cleanup cron (old rejected docs)
CREATE INDEX IF NOT EXISTS idx_identity_verifications_rejected_date
  ON identity_verifications(reviewed_at)
  WHERE status = 'rejected';

-- RPC to increment restriction_count on repeated failures
CREATE OR REPLACE FUNCTION increment_restriction_count(uid uuid)
RETURNS void AS $$
BEGIN
  UPDATE profiles
  SET restriction_count = COALESCE(restriction_count, 0) + 1
  WHERE id = uid OR user_id = uid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 5. RATE LIMITING (ATOMIC, DB-BACKED)
-- ============================================================

CREATE TABLE IF NOT EXISTS rate_limits (
  key text PRIMARY KEY,
  count int NOT NULL DEFAULT 0,
  reset_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON rate_limits(reset_at);

-- Atomic rate limit check: returns TRUE if allowed, FALSE if blocked.
-- Uses INSERT ... ON CONFLICT to avoid race conditions.
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key text,
  p_limit int,
  p_window_sec int
)
RETURNS boolean AS $$
DECLARE
  v_count int;
  v_reset_at timestamptz;
  v_now timestamptz := now();
BEGIN
  INSERT INTO rate_limits (key, count, reset_at)
  VALUES (p_key, 1, v_now + (p_window_sec || ' seconds')::interval)
  ON CONFLICT (key) DO UPDATE
    SET
      count = CASE
        WHEN rate_limits.reset_at < v_now THEN 1
        ELSE rate_limits.count + 1
      END,
      reset_at = CASE
        WHEN rate_limits.reset_at < v_now
          THEN v_now + (p_window_sec || ' seconds')::interval
        ELSE rate_limits.reset_at
      END
  RETURNING count, reset_at INTO v_count, v_reset_at;

  RETURN v_count <= p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup expired entries (called by daily cron)
CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS void AS $$
BEGIN
  DELETE FROM rate_limits WHERE reset_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 6. ADAPTIVE FRAUD DETECTION (AI-ASSISTED)
-- ============================================================

-- Behavioral tracking on profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS last_ip text;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS last_device text;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS velocity_score int DEFAULT 0;

-- Fraud anomalies log (AI + behavior engine results)
CREATE TABLE IF NOT EXISTS fraud_anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  ip text,
  type text NOT NULL,          -- behavior | ai | combined
  score int NOT NULL DEFAULT 0,
  decision text NOT NULL DEFAULT 'allow',  -- allow | flag | review | restrict
  reason text,
  flags text[] DEFAULT '{}',
  context jsonb DEFAULT '{}'::jsonb,
  admin_override text,         -- NULL | confirmed_fraud | false_positive
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fraud_anomalies_user ON fraud_anomalies(user_id);
CREATE INDEX IF NOT EXISTS idx_fraud_anomalies_decision ON fraud_anomalies(decision) WHERE decision != 'allow';
CREATE INDEX IF NOT EXISTS idx_fraud_anomalies_created ON fraud_anomalies(created_at);

-- RLS: only service role
ALTER TABLE fraud_anomalies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on fraud_anomalies" ON fraud_anomalies;
CREATE POLICY "Service role full access on fraud_anomalies"
  ON fraud_anomalies FOR ALL
  USING (auth.role() = 'service_role');
