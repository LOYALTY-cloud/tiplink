-- Create table for storing card references per user
CREATE TABLE IF NOT EXISTS cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_card_id text NOT NULL UNIQUE,
  brand text,
  last4 text,
  status text,
  created_at timestamp with time zone DEFAULT now()
);
