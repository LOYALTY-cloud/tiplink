-- Goals table: persists user earning goals
CREATE TABLE IF NOT EXISTS goals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount      NUMERIC NOT NULL,
  period      TEXT NOT NULL CHECK (period IN ('day', 'week', 'month')),
  duration    INTEGER NOT NULL,
  start_date  TIMESTAMPTZ NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active goal per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_goals_active_user
  ON goals(user_id) WHERE is_completed = false;

-- RLS
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their goals"
  ON goals FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
