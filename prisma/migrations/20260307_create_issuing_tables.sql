-- Create table for card authorizations
CREATE TABLE IF NOT EXISTS issuing_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_auth_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  currency text NOT NULL,
  status text NOT NULL,
  merchant_name text,
  created_at timestamp with time zone DEFAULT now()
);

-- Create table for webhook logs
CREATE TABLE IF NOT EXISTS issuing_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamp with time zone DEFAULT now()
);

-- Ensure wallet balance exists
ALTER TABLE IF EXISTS wallets
  ADD COLUMN IF NOT EXISTS available integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending integer DEFAULT 0;
