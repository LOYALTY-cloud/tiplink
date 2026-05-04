-- Add wallet 2FA toggle to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS wallet_2fa_enabled boolean NOT NULL DEFAULT false;

-- Track when wallet was last unlocked server-side (set by verify-code & biometric verify)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS wallet_unlocked_at timestamptz;

-- OTP table for wallet unlock codes
CREATE TABLE IF NOT EXISTS wallet_otp (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE wallet_otp ENABLE ROW LEVEL SECURITY;

-- Biometric credentials (WebAuthn passkeys)
CREATE TABLE IF NOT EXISTS wallet_biometrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id text NOT NULL,
  public_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, credential_id)
);

ALTER TABLE wallet_biometrics ENABLE ROW LEVEL SECURITY;

-- Only service-role can read/write (API routes use supabaseAdmin)
-- No user-facing policies needed

-- Force RLS even for table owner
ALTER TABLE wallet_otp FORCE ROW LEVEL SECURITY;
ALTER TABLE wallet_biometrics FORCE ROW LEVEL SECURITY;

-- Biometric challenge store (server-generated, short-lived)
CREATE TABLE IF NOT EXISTS wallet_biometric_challenges (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE wallet_biometric_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_biometric_challenges FORCE ROW LEVEL SECURITY;

-- Prevent duplicate ledger entries for the same reference event
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_unique_entry
  ON transactions_ledger(reference_id, type, user_id)
  WHERE reference_id IS NOT NULL;

-- Atomic ledger insert + wallet recalculation in a single transaction.
-- This prevents races where two concurrent inserts both recalculate
-- from stale balances.
CREATE OR REPLACE FUNCTION add_ledger_entry_atomic(
  p_user_id uuid,
  p_type text,
  p_amount numeric,
  p_reference_id text DEFAULT NULL,
  p_meta jsonb DEFAULT '{}'::jsonb,
  p_status text DEFAULT 'completed'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row transactions_ledger;
BEGIN
  -- Lock the user's wallet row to serialize concurrent ledger writes
  PERFORM 1 FROM wallets WHERE user_id = p_user_id FOR UPDATE;

  INSERT INTO transactions_ledger (user_id, type, amount, reference_id, meta, status, created_at)
  VALUES (p_user_id, p_type, p_amount, p_reference_id, p_meta, p_status, now())
  RETURNING * INTO v_row;

  -- Recalculate wallet balance from full ledger
  PERFORM recalculate_wallet_balance(p_user_id);

  RETURN to_jsonb(v_row);
END;
$$;
