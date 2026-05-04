-- Add optional supporter email to tip_intents for receipt delivery.
ALTER TABLE tip_intents
  ADD COLUMN IF NOT EXISTS supporter_email text;
