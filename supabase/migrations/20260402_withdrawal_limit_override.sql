-- Add admin withdrawal limit override flag
-- When true, the user is exempt from daily withdrawal limits.
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS withdrawal_limit_override boolean DEFAULT false;
