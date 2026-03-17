-- Index for fast transaction feed queries + Supabase realtime filtering
CREATE INDEX IF NOT EXISTS idx_ledger_user_created
ON transactions_ledger (user_id, created_at DESC);

-- Status column for tracking payout lifecycle (processing → paid → failed)
ALTER TABLE transactions_ledger
ADD COLUMN IF NOT EXISTS status text DEFAULT 'completed';
