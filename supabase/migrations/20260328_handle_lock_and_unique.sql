-- Add handle_locked_until column for 2-week lock on new accounts
-- and unique index so no two users can have the same handle.
--
-- RUN THIS IN THE SUPABASE SQL EDITOR.

-- 1. Add handle lock column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS handle_locked_until timestamptz DEFAULT NULL;

-- 2. Add unique partial index on handle (ignores NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_handle_unique ON profiles (handle) WHERE handle IS NOT NULL;
