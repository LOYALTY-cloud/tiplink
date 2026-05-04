-- Dispute events: full audit trail / timeline for each dispute case
CREATE TABLE IF NOT EXISTS dispute_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id text NOT NULL,
  admin_id uuid,
  type text NOT NULL CHECK (type IN ('claim', 'release', 'status_change', 'note', 'system', 'proposal', 'approval', 'rejection')),
  message text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispute_events_dispute ON dispute_events(dispute_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispute_events_admin ON dispute_events(admin_id);
