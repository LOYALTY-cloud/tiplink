-- Theme purchases (unlock system)
CREATE TABLE IF NOT EXISTS theme_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  theme TEXT NOT NULL,
  stripe_session_id TEXT,
  amount INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, theme)
);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_theme_purchases_user_id ON theme_purchases(user_id);
