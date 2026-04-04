-- ============================================================
-- SECURITY HARDENING PHASE 3: Missing RLS on remaining tables
-- (idempotent — safe to re-run)
--
-- Covers tables discovered with NO RLS at all:
--   card_transactions, card_declines, issuing_logs,
--   fraud_events, ledger_audit_logs, stripe_onboard_admin_logs,
--   processed_refunds, cards, payout_methods, withdrawals
--
-- Also adds FORCE RLS to admin_access_logs and support_logs.
-- ============================================================

-- ============================
-- 1. CARD_TRANSACTIONS — user sees own; admin sees all
-- ============================
ALTER TABLE card_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_transactions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "card_txn_select_self" ON card_transactions;
CREATE POLICY "card_txn_select_self"
  ON card_transactions FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

-- No client write — service role only
DROP POLICY IF EXISTS "card_txn_deny_write" ON card_transactions;
CREATE POLICY "card_txn_deny_write"
  ON card_transactions FOR INSERT
  WITH CHECK (false);

REVOKE ALL ON card_transactions FROM anon, authenticated;
GRANT SELECT ON card_transactions TO authenticated;


-- ============================
-- 2. CARD_DECLINES — user sees own; admin sees all
-- ============================
ALTER TABLE card_declines ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_declines FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "card_declines_select_self" ON card_declines;
CREATE POLICY "card_declines_select_self"
  ON card_declines FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "card_declines_deny_write" ON card_declines;
CREATE POLICY "card_declines_deny_write"
  ON card_declines FOR INSERT
  WITH CHECK (false);

REVOKE ALL ON card_declines FROM anon, authenticated;
GRANT SELECT ON card_declines TO authenticated;


-- ============================
-- 3. ISSUING_LOGS — admin only
-- ============================
ALTER TABLE issuing_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE issuing_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "issuing_logs_admin_read" ON issuing_logs;
CREATE POLICY "issuing_logs_admin_read"
  ON issuing_logs FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "issuing_logs_deny_write" ON issuing_logs;
CREATE POLICY "issuing_logs_deny_write"
  ON issuing_logs FOR ALL
  USING (false);

REVOKE ALL ON issuing_logs FROM anon, authenticated;
GRANT SELECT ON issuing_logs TO authenticated;


-- ============================
-- 4. FRAUD_EVENTS — admin only (contains IPs + detection logic)
-- ============================
ALTER TABLE fraud_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fraud_events_admin_read" ON fraud_events;
CREATE POLICY "fraud_events_admin_read"
  ON fraud_events FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "fraud_events_deny_all" ON fraud_events;
CREATE POLICY "fraud_events_deny_all"
  ON fraud_events FOR ALL
  USING (false);

REVOKE ALL ON fraud_events FROM anon, authenticated;
GRANT SELECT ON fraud_events TO authenticated;


-- ============================
-- 5. LEDGER_AUDIT_LOGS — admin only
-- ============================
ALTER TABLE ledger_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_audit_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ledger_audit_admin_read" ON ledger_audit_logs;
CREATE POLICY "ledger_audit_admin_read"
  ON ledger_audit_logs FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "ledger_audit_deny_write" ON ledger_audit_logs;
CREATE POLICY "ledger_audit_deny_write"
  ON ledger_audit_logs FOR INSERT
  WITH CHECK (false);

REVOKE ALL ON ledger_audit_logs FROM anon, authenticated;
GRANT SELECT ON ledger_audit_logs TO authenticated;


-- ============================
-- 6. STRIPE_ONBOARD_ADMIN_LOGS — admin only
-- ============================
ALTER TABLE stripe_onboard_admin_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_onboard_admin_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stripe_onboard_logs_admin_read" ON stripe_onboard_admin_logs;
CREATE POLICY "stripe_onboard_logs_admin_read"
  ON stripe_onboard_admin_logs FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "stripe_onboard_logs_deny_write" ON stripe_onboard_admin_logs;
CREATE POLICY "stripe_onboard_logs_deny_write"
  ON stripe_onboard_admin_logs FOR ALL
  USING (false);

REVOKE ALL ON stripe_onboard_admin_logs FROM anon, authenticated;
GRANT SELECT ON stripe_onboard_admin_logs TO authenticated;


-- ============================
-- 7. PROCESSED_REFUNDS — service role only
-- ============================
ALTER TABLE processed_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_refunds FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "processed_refunds_deny_all" ON processed_refunds;
CREATE POLICY "processed_refunds_deny_all"
  ON processed_refunds FOR ALL
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON processed_refunds FROM anon, authenticated;


-- ============================
-- 8. CARDS — user sees own; admin sees all (if table exists)
-- ============================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='cards') THEN
    EXECUTE 'ALTER TABLE cards ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE cards FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "cards_select_self" ON cards';
    EXECUTE $pol$
      CREATE POLICY "cards_select_self"
        ON cards FOR SELECT
        USING (user_id = auth.uid() OR public.is_admin())
    $pol$;
    EXECUTE 'DROP POLICY IF EXISTS "cards_deny_write" ON cards';
    EXECUTE $pol$
      CREATE POLICY "cards_deny_write"
        ON cards FOR INSERT
        WITH CHECK (false)
    $pol$;
    EXECUTE 'REVOKE ALL ON cards FROM anon, authenticated';
    EXECUTE 'GRANT SELECT ON cards TO authenticated';
  END IF;
END $$;


-- ============================
-- 9. PAYOUT_METHODS — user sees own; admin sees all (if table exists)
-- ============================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payout_methods') THEN
    EXECUTE 'ALTER TABLE payout_methods ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE payout_methods FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "payout_methods_select_self" ON payout_methods';
    EXECUTE $pol$
      CREATE POLICY "payout_methods_select_self"
        ON payout_methods FOR SELECT
        USING (user_id = auth.uid() OR public.is_admin())
    $pol$;
    EXECUTE 'DROP POLICY IF EXISTS "payout_methods_deny_write" ON payout_methods';
    EXECUTE $pol$
      CREATE POLICY "payout_methods_deny_write"
        ON payout_methods FOR INSERT
        WITH CHECK (false)
    $pol$;
    EXECUTE 'REVOKE ALL ON payout_methods FROM anon, authenticated';
    EXECUTE 'GRANT SELECT ON payout_methods TO authenticated';
  END IF;
END $$;


-- ============================
-- 10. WITHDRAWALS — user sees own; admin sees all (if table exists)
-- ============================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='withdrawals') THEN
    EXECUTE 'ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE withdrawals FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "withdrawals_select_self" ON withdrawals';
    EXECUTE $pol$
      CREATE POLICY "withdrawals_select_self"
        ON withdrawals FOR SELECT
        USING (user_id = auth.uid() OR public.is_admin())
    $pol$;
    EXECUTE 'DROP POLICY IF EXISTS "withdrawals_deny_write" ON withdrawals';
    EXECUTE $pol$
      CREATE POLICY "withdrawals_deny_write"
        ON withdrawals FOR INSERT
        WITH CHECK (false)
    $pol$;
    EXECUTE 'REVOKE ALL ON withdrawals FROM anon, authenticated';
    EXECUTE 'GRANT SELECT ON withdrawals TO authenticated';
  END IF;
END $$;


-- ============================
-- 11. HARDEN: FORCE RLS on admin_access_logs + support_logs
-- ============================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='admin_access_logs') THEN
    EXECUTE 'ALTER TABLE admin_access_logs FORCE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='support_logs') THEN
    EXECUTE 'ALTER TABLE support_logs FORCE ROW LEVEL SECURITY';
  END IF;
END $$;
