-- Daily wallet/earnings snapshots for analytics
CREATE TABLE IF NOT EXISTS daily_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  balance numeric NOT NULL DEFAULT 0,
  total_earned numeric NOT NULL DEFAULT 0,
  date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_snapshots_user_date
  ON daily_snapshots(user_id, date DESC);

ALTER TABLE daily_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_snapshots FORCE ROW LEVEL SECURITY;

-- Single-query snapshot: joins wallets with aggregated tip_received earnings
CREATE OR REPLACE FUNCTION snapshot_wallet_balances()
RETURNS TABLE(user_id uuid, balance numeric, total_earned numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    w.user_id,
    w.balance,
    COALESCE(e.total, 0) AS total_earned
  FROM wallets w
  LEFT JOIN (
    SELECT tl.user_id, SUM(tl.amount) AS total
    FROM transactions_ledger tl
    WHERE tl.type = 'tip_received'
    GROUP BY tl.user_id
  ) e ON e.user_id = w.user_id;
$$;
