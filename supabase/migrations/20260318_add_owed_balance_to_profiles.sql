-- Track how much a creator owes the platform (e.g. refund pushed balance negative)
-- Enables: future earnings auto-offset, manual repayment, admin visibility
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS owed_balance numeric DEFAULT 0;
