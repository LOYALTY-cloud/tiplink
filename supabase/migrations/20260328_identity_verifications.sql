-- Identity verification (KYC-lite) system
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
