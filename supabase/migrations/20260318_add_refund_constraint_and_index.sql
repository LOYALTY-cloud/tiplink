-- Safety constraint: refunded_amount can never exceed the original tip_amount
ALTER TABLE tip_intents
ADD CONSTRAINT refunded_amount_lte_tip
CHECK (refunded_amount <= tip_amount);

-- Composite index for fast refund window lookups (withdrawal guard queries)
CREATE INDEX IF NOT EXISTS idx_tip_refund_window
ON tip_intents (creator_user_id, refund_status, refund_initiated_at);
