-- AI case analysis cache for disputes
-- Stores structured AI output to avoid re-calling on every page load

CREATE TABLE IF NOT EXISTS dispute_ai_analysis (
  receipt_id text PRIMARY KEY,
  ai_summary text,
  ai_risk_level text CHECK (ai_risk_level IN ('low', 'medium', 'high')),
  ai_signals jsonb DEFAULT '[]'::jsonb,
  ai_explanation jsonb DEFAULT '[]'::jsonb,
  ai_suggested_actions jsonb DEFAULT '[]'::jsonb,
  ai_last_updated timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispute_ai_receipt ON dispute_ai_analysis(receipt_id);
