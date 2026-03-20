-- Refund approval workflow tables
-- Refund > $100 requires 2 approvals, > $350 requires owner approval

CREATE TABLE IF NOT EXISTS refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tip_intent_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  required_approvals int NOT NULL DEFAULT 2,
  requires_owner boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),

  CONSTRAINT refund_requests_status_check CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE TABLE IF NOT EXISTS refund_approval_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_id uuid NOT NULL REFERENCES refund_requests(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),

  UNIQUE(refund_id, admin_id)
);

CREATE INDEX IF NOT EXISTS idx_refund_requests_status ON refund_requests(status);
CREATE INDEX IF NOT EXISTS idx_refund_requests_tip ON refund_requests(tip_intent_id);
CREATE INDEX IF NOT EXISTS idx_refund_votes_refund ON refund_approval_votes(refund_id);
