-- ============================================================
-- PRODUCTION RLS LOCKDOWN (idempotent — safe to re-run)
-- Enable Row Level Security on all tables and add policies.
-- Service role key bypasses RLS, so server-side API routes are unaffected.
-- Admin users get read access via role check on profiles table.
-- ============================================================

-- Helper: admin check used in policies
-- (Supabase evaluates this inline — no function needed)
-- Pattern: EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN (...))

-- ============================
-- 1. WALLETS — users see own; admins see all
-- ============================
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own wallet" ON wallets;
CREATE POLICY "Users can view own wallet"
  ON wallets FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all wallets" ON wallets;
CREATE POLICY "Admins can view all wallets"
  ON wallets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('owner', 'super_admin', 'finance_admin', 'support_admin')
    )
  );

-- No INSERT/UPDATE/DELETE from client — server (service role) only

-- ============================
-- 2. TRANSACTIONS_LEDGER — read-only for own user; admins see all
-- ============================
ALTER TABLE transactions_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions_ledger FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own transactions" ON transactions_ledger;
CREATE POLICY "Users can view own transactions"
  ON transactions_ledger FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all transactions" ON transactions_ledger;
CREATE POLICY "Admins can view all transactions"
  ON transactions_ledger FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('owner', 'super_admin', 'finance_admin', 'support_admin')
    )
  );

-- Append-only already enforced by trigger; RLS blocks client INSERT/UPDATE/DELETE

-- ============================
-- 3. TIP_INTENTS — users see own; admins see all
-- ============================
ALTER TABLE tip_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE tip_intents FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own tips" ON tip_intents;
CREATE POLICY "Users can view own tips"
  ON tip_intents FOR SELECT
  USING (auth.uid() = creator_user_id);

DROP POLICY IF EXISTS "Admins can view all tips" ON tip_intents;
CREATE POLICY "Admins can view all tips"
  ON tip_intents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('owner', 'super_admin', 'finance_admin', 'support_admin')
    )
  );

-- ============================
-- 4. WALLET_LOCKS — server-only (no client access)
-- ============================
ALTER TABLE wallet_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_locks FORCE ROW LEVEL SECURITY;

-- No policies = no client access at all

-- ============================
-- 5. ADMIN_ACTIONS — admin read-only
-- ============================
ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_actions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view admin actions" ON admin_actions;
CREATE POLICY "Admins can view admin actions"
  ON admin_actions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('owner', 'super_admin', 'finance_admin', 'support_admin')
    )
  );

-- INSERT/UPDATE/DELETE = server-only (service role)

-- ============================
-- 6. SUPPORT_NOTES — admin read-only
-- ============================
ALTER TABLE support_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_notes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view support notes" ON support_notes;
CREATE POLICY "Admins can view support notes"
  ON support_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('owner', 'super_admin', 'finance_admin', 'support_admin')
    )
  );

-- INSERT/UPDATE/DELETE = server-only (service role)

-- ============================
-- 7. REFUND_REQUESTS — admin read-only
-- ============================
ALTER TABLE refund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE refund_requests FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view refund requests" ON refund_requests;
CREATE POLICY "Admins can view refund requests"
  ON refund_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('owner', 'super_admin', 'finance_admin', 'support_admin')
    )
  );

-- INSERT/UPDATE/DELETE = server-only (service role)

-- ============================
-- 8. REFUND_APPROVAL_VOTES — admin read-only
-- ============================
ALTER TABLE refund_approval_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE refund_approval_votes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view refund votes" ON refund_approval_votes;
CREATE POLICY "Admins can view refund votes"
  ON refund_approval_votes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('owner', 'super_admin', 'finance_admin', 'support_admin')
    )
  );

-- INSERT/UPDATE/DELETE = server-only (service role)

-- ============================
-- 9. RISK_ALERTS — admin read-only
-- ============================
ALTER TABLE risk_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_alerts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view risk alerts" ON risk_alerts;
CREATE POLICY "Admins can view risk alerts"
  ON risk_alerts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('owner', 'super_admin', 'finance_admin', 'support_admin')
    )
  );

-- INSERT/UPDATE/DELETE = server-only (service role)

-- ============================
-- 10. STRIPE_WEBHOOK_EVENTS — server-only
-- ============================
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_webhook_events FORCE ROW LEVEL SECURITY;

-- No policies = no client access at all

-- ============================
-- 11. EMAIL_VERIFICATIONS — already has RLS enabled, add policy
-- ============================
DROP POLICY IF EXISTS "Users can view own verifications" ON email_verifications;
CREATE POLICY "Users can view own verifications"
  ON email_verifications FOR SELECT
  USING (auth.uid() = user_id);
