-- Dispute assignment: track which admin is assigned to handle a dispute
-- Ensures only ONE admin can claim a case (unique constraint on dispute_id)

-- If the table was created with the old column name, drop and recreate
DROP TABLE IF EXISTS dispute_assignments;

CREATE TABLE dispute_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id text NOT NULL,
  admin_id uuid NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid,
  UNIQUE (dispute_id)
);

CREATE INDEX IF NOT EXISTS idx_dispute_assignments_dispute ON dispute_assignments(dispute_id);
CREATE INDEX IF NOT EXISTS idx_dispute_assignments_admin ON dispute_assignments(admin_id);
