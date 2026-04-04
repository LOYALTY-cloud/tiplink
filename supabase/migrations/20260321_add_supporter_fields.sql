-- Add supporter identity fields to tip_intents
ALTER TABLE tip_intents
  ADD COLUMN IF NOT EXISTS supporter_name TEXT,
  ADD COLUMN IF NOT EXISTS message TEXT,
  ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT true;
