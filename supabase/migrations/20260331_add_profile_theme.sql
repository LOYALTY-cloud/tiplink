-- Add theme column to profiles table
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'default';

-- Optional: Add CHECK constraint to limit valid theme values
-- ALTER TABLE profiles
--   ADD CONSTRAINT profiles_theme_check
--   CHECK (theme IN ('default', 'dark', 'gold', 'gradient', 'glass', 'bold'));
