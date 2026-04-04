-- ============================================================================
-- MIGRATION: Standardize all user_id FKs to reference profiles(user_id)
-- ============================================================================
-- Problem: Older tables reference profiles(id) (internal DB UUID), but the
-- canonical identity is profiles.user_id (Supabase auth UUID). For some users
-- these differ, causing FK failures and query mismatches.
--
-- Fix: Drop old FKs, backfill auth UUIDs, re-add FKs pointing to profiles(user_id).
--
-- INSTRUCTIONS: Paste this entire block into the Supabase SQL Editor and run it.
-- https://supabase.com/dashboard/project/cjakxygbgijsknoadrrs/sql/new
-- ============================================================================

BEGIN;

-- ── 1. Disable the ledger immutability trigger ──────────────────────────────
DROP TRIGGER IF EXISTS trg_transactions_immutable ON transactions_ledger;

-- ── 2. Drop ALL old FK constraints referencing profiles(id) ─────────────────
--    Must happen BEFORE the backfill so UPDATEs aren't rejected.

ALTER TABLE transactions_ledger DROP CONSTRAINT IF EXISTS transactions_ledger_user_id_fkey;
ALTER TABLE wallets              DROP CONSTRAINT IF EXISTS wallets_user_id_fkey;
ALTER TABLE wallet_locks         DROP CONSTRAINT IF EXISTS wallet_locks_user_id_fkey;
ALTER TABLE card_transactions    DROP CONSTRAINT IF EXISTS card_transactions_user_id_fkey;
ALTER TABLE card_declines        DROP CONSTRAINT IF EXISTS card_declines_user_id_fkey;
ALTER TABLE ledger_audit_logs    DROP CONSTRAINT IF EXISTS ledger_audit_logs_user_id_fkey;
ALTER TABLE ledger_audit_logs    DROP CONSTRAINT IF EXISTS ledger_audit_logs_performed_by_fkey;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'issuing_logs' AND column_name = 'user_id' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE issuing_logs DROP CONSTRAINT IF EXISTS issuing_logs_user_id_fkey';
  END IF;
END $$;

-- stripe_onboard_admin_logs (all possible constraint names)
ALTER TABLE stripe_onboard_admin_logs DROP CONSTRAINT IF EXISTS stripe_onboard_admin_logs_user_fkey;
ALTER TABLE stripe_onboard_admin_logs DROP CONSTRAINT IF EXISTS stripe_onboard_admin_logs_admin_fkey;
ALTER TABLE stripe_onboard_admin_logs DROP CONSTRAINT IF EXISTS stripe_onboard_admin_logs_user_id_fkey;
ALTER TABLE stripe_onboard_admin_logs DROP CONSTRAINT IF EXISTS stripe_onboard_admin_logs_admin_id_fkey;

-- cards (conditionally)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'cards_user_id_fkey' AND table_name = 'cards') THEN
    ALTER TABLE cards DROP CONSTRAINT cards_user_id_fkey;
  END IF;
END $$;

-- payout_methods (conditionally)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'payout_methods_user_id_fkey' AND table_name = 'payout_methods') THEN
    ALTER TABLE payout_methods DROP CONSTRAINT payout_methods_user_id_fkey;
  END IF;
END $$;

-- ── 3. Backfill: replace profiles.id with profiles.user_id ──────────────────
--    Only rows where the two differ need updating.

UPDATE transactions_ledger t
SET    user_id = p.user_id
FROM   profiles p
WHERE  t.user_id = p.id AND p.id != p.user_id;

UPDATE wallets w
SET    user_id = p.user_id
FROM   profiles p
WHERE  w.user_id = p.id AND p.id != p.user_id;

UPDATE wallet_locks wl
SET    user_id = p.user_id
FROM   profiles p
WHERE  wl.user_id = p.id AND p.id != p.user_id;

UPDATE card_transactions ct
SET    user_id = p.user_id
FROM   profiles p
WHERE  ct.user_id = p.id AND p.id != p.user_id;

UPDATE card_declines cd
SET    user_id = p.user_id
FROM   profiles p
WHERE  cd.user_id = p.id AND p.id != p.user_id;

UPDATE ledger_audit_logs la
SET    user_id = p.user_id
FROM   profiles p
WHERE  la.user_id = p.id AND p.id != p.user_id;

UPDATE ledger_audit_logs la
SET    performed_by = p.user_id
FROM   profiles p
WHERE  la.performed_by = p.id AND p.id != p.user_id;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'issuing_logs' AND column_name = 'user_id' AND table_schema = 'public') THEN
    EXECUTE 'UPDATE issuing_logs il SET user_id = p.user_id FROM profiles p WHERE il.user_id = p.id AND p.id != p.user_id';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stripe_onboard_admin_logs' AND table_schema = 'public') THEN
    UPDATE stripe_onboard_admin_logs s
    SET    user_id = p.user_id
    FROM   profiles p
    WHERE  s.user_id = p.id AND p.id != p.user_id;

    UPDATE stripe_onboard_admin_logs s
    SET    admin_id = p.user_id
    FROM   profiles p
    WHERE  s.admin_id = p.id AND p.id != p.user_id;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cards' AND column_name = 'user_id' AND table_schema = 'public') THEN
    UPDATE cards c
    SET    user_id = p.user_id
    FROM   profiles p
    WHERE  c.user_id = p.id AND p.id != p.user_id;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payout_methods' AND column_name = 'user_id' AND table_schema = 'public') THEN
    UPDATE payout_methods pm
    SET    user_id = p.user_id
    FROM   profiles p
    WHERE  pm.user_id = p.id AND p.id != p.user_id;
  END IF;
END $$;

-- ── 4. Add new FK constraints → profiles(user_id) ──────────────────────────

ALTER TABLE transactions_ledger
  ADD CONSTRAINT transactions_ledger_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE;

ALTER TABLE wallets
  ADD CONSTRAINT wallets_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE;

ALTER TABLE wallet_locks
  ADD CONSTRAINT wallet_locks_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE;

ALTER TABLE card_transactions
  ADD CONSTRAINT card_transactions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE;

ALTER TABLE card_declines
  ADD CONSTRAINT card_declines_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE;

ALTER TABLE ledger_audit_logs
  ADD CONSTRAINT ledger_audit_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE SET NULL;

ALTER TABLE ledger_audit_logs
  ADD CONSTRAINT ledger_audit_logs_performed_by_fkey
  FOREIGN KEY (performed_by) REFERENCES profiles(user_id) ON DELETE SET NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'issuing_logs' AND column_name = 'user_id' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE issuing_logs ADD CONSTRAINT issuing_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(user_id)';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stripe_onboard_admin_logs' AND table_schema = 'public') THEN
    ALTER TABLE stripe_onboard_admin_logs
      ADD CONSTRAINT stripe_onboard_admin_logs_user_fkey
      FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE;
    ALTER TABLE stripe_onboard_admin_logs
      ADD CONSTRAINT stripe_onboard_admin_logs_admin_fkey
      FOREIGN KEY (admin_id) REFERENCES profiles(user_id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cards' AND column_name = 'user_id' AND table_schema = 'public') THEN
    ALTER TABLE cards
      ADD CONSTRAINT cards_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payout_methods' AND column_name = 'user_id' AND table_schema = 'public') THEN
    ALTER TABLE payout_methods
      ADD CONSTRAINT payout_methods_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE;
  END IF;
END $$;

-- ── 5. Re-enable ledger immutability trigger ────────────────────────────────
CREATE TRIGGER trg_transactions_immutable
  BEFORE UPDATE OR DELETE ON transactions_ledger
  FOR EACH ROW EXECUTE PROCEDURE transactions_ledger_prevent_update_delete();

COMMIT;
