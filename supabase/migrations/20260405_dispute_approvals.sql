-- Dispute approval queue: multi-tier approval for dispute resolution
-- Finance admin → needs super_admin/owner. Two super_admins → approved. Owner → instant.

CREATE TABLE IF NOT EXISTS dispute_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('accept', 'counter')),
  note text NOT NULL,
  
  -- First approval (proposer)
  proposed_by uuid NOT NULL,
  proposed_by_role text NOT NULL,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  
  -- Second approval (finalizer) — null until approved
  approved_by uuid,
  approved_by_role text,
  approved_at timestamptz,
  
  -- Status
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reject_note text,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispute_approvals_receipt ON dispute_approvals(receipt_id, status);
CREATE INDEX IF NOT EXISTS idx_dispute_approvals_pending ON dispute_approvals(status) WHERE status = 'pending';
