-- Unique refund ID table: bulletproof idempotency against retries + race conditions
-- The array check on tip_intents is a fast path; this table is the hard guarantee.
CREATE TABLE IF NOT EXISTS processed_refunds (
  refund_id text PRIMARY KEY,
  tip_id uuid NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

-- Index for admin queries: find all refunds for a given tip
CREATE INDEX IF NOT EXISTS idx_processed_refunds_tip_id
ON processed_refunds (tip_id);
