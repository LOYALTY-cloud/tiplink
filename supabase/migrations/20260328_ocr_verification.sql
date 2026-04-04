-- Add OCR data + match score columns to identity_verifications
-- Run this in your Supabase SQL editor

ALTER TABLE identity_verifications
ADD COLUMN IF NOT EXISTS ocr_data jsonb;

ALTER TABLE identity_verifications
ADD COLUMN IF NOT EXISTS match_score int;

-- Store the document storage path (not public URL) for signed URL generation
ALTER TABLE identity_verifications
ADD COLUMN IF NOT EXISTS document_path text;

ALTER TABLE identity_verifications
ADD COLUMN IF NOT EXISTS document_back_path text;

-- Track active verification (prevent spam uploads)
ALTER TABLE identity_verifications
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Add DOB to profiles for identity matching (if not present)
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
