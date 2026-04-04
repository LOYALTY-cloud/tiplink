-- ============================================================
-- RLS LOCKDOWN PHASE 2 (idempotent — safe to re-run)
-- Enables RLS + policies on remaining unprotected public tables:
--   theme_purchases, support_sessions, support_messages,
--   support_typing, support_notifications, rate_limits
-- Service role key bypasses RLS, so server-side API routes are unaffected.
-- ============================================================

-- ============================
-- 1. THEME_PURCHASES — users see/insert own; admins see all
-- ============================
ALTER TABLE theme_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE theme_purchases FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own theme purchases" ON theme_purchases;
CREATE POLICY "Users can view own theme purchases"
  ON theme_purchases FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own theme purchases" ON theme_purchases;
CREATE POLICY "Users can insert own theme purchases"
  ON theme_purchases FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all theme purchases" ON theme_purchases;
CREATE POLICY "Admins can view all theme purchases"
  ON theme_purchases FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('owner', 'super_admin', 'finance_admin', 'support_admin')
    )
  );

-- No UPDATE/DELETE from client — server (service role) only

-- ============================
-- 2. SUPPORT_SESSIONS — users see own; admins see all + update
-- ============================
ALTER TABLE support_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_sessions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own support sessions" ON support_sessions;
CREATE POLICY "Users can view own support sessions"
  ON support_sessions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own support sessions" ON support_sessions;
CREATE POLICY "Users can insert own support sessions"
  ON support_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all support sessions" ON support_sessions;
CREATE POLICY "Admins can view all support sessions"
  ON support_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('owner', 'super_admin', 'finance_admin', 'support_admin')
    )
  );

DROP POLICY IF EXISTS "Admins can update support sessions" ON support_sessions;
CREATE POLICY "Admins can update support sessions"
  ON support_sessions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('owner', 'super_admin', 'finance_admin', 'support_admin')
    )
  );

-- ============================
-- 3. SUPPORT_MESSAGES — users see messages in own session; admins see all
-- ============================
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view messages in own session" ON support_messages;
CREATE POLICY "Users can view messages in own session"
  ON support_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM support_sessions
      WHERE support_sessions.id = support_messages.session_id
      AND support_sessions.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert messages in own session" ON support_messages;
CREATE POLICY "Users can insert messages in own session"
  ON support_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM support_sessions
      WHERE support_sessions.id = support_messages.session_id
      AND support_sessions.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can view all support messages" ON support_messages;
CREATE POLICY "Admins can view all support messages"
  ON support_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('owner', 'super_admin', 'finance_admin', 'support_admin')
    )
  );

DROP POLICY IF EXISTS "Admins can insert support messages" ON support_messages;
CREATE POLICY "Admins can insert support messages"
  ON support_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('owner', 'super_admin', 'finance_admin', 'support_admin')
    )
  );

DROP POLICY IF EXISTS "Admins can update support messages" ON support_messages;
CREATE POLICY "Admins can update support messages"
  ON support_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('owner', 'super_admin', 'finance_admin', 'support_admin')
    )
  );

-- ============================
-- 4. SUPPORT_TYPING — users see typing in own session; admins see all
-- ============================
ALTER TABLE support_typing ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_typing FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view typing in own session" ON support_typing;
CREATE POLICY "Users can view typing in own session"
  ON support_typing FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM support_sessions
      WHERE support_sessions.id = support_typing.session_id
      AND support_sessions.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update typing in own session" ON support_typing;
CREATE POLICY "Users can update typing in own session"
  ON support_typing FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM support_sessions
      WHERE support_sessions.id = support_typing.session_id
      AND support_sessions.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can view all typing" ON support_typing;
CREATE POLICY "Admins can view all typing"
  ON support_typing FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('owner', 'super_admin', 'finance_admin', 'support_admin')
    )
  );

DROP POLICY IF EXISTS "Admins can update all typing" ON support_typing;
CREATE POLICY "Admins can update all typing"
  ON support_typing FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('owner', 'super_admin', 'finance_admin', 'support_admin')
    )
  );

-- ============================
-- 5. SUPPORT_NOTIFICATIONS — admin-only (inter-admin transfers)
-- ============================
ALTER TABLE support_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_notifications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view support notifications" ON support_notifications;
CREATE POLICY "Admins can view support notifications"
  ON support_notifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('owner', 'super_admin', 'finance_admin', 'support_admin')
    )
  );

DROP POLICY IF EXISTS "Admins can insert support notifications" ON support_notifications;
CREATE POLICY "Admins can insert support notifications"
  ON support_notifications FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('owner', 'super_admin', 'finance_admin', 'support_admin')
    )
  );

DROP POLICY IF EXISTS "Admins can update support notifications" ON support_notifications;
CREATE POLICY "Admins can update support notifications"
  ON support_notifications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('owner', 'super_admin', 'finance_admin', 'support_admin')
    )
  );

-- ============================
-- 6. RATE_LIMITS — fully locked; service role only
-- ============================
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits FORCE ROW LEVEL SECURITY;

-- Block all client access; only service role (bypasses RLS) can touch this table.
-- The SECURITY DEFINER functions (check_rate_limit, cleanup_rate_limits) already
-- execute as the function owner, so they continue to work.
DROP POLICY IF EXISTS "Deny all client access to rate_limits" ON rate_limits;
CREATE POLICY "Deny all client access to rate_limits"
  ON rate_limits FOR ALL
  USING (false);

-- ============================
-- 7. REVOKE direct anon access to sensitive tables
-- ============================
REVOKE ALL ON support_messages FROM anon;
REVOKE ALL ON support_sessions FROM anon;
REVOKE ALL ON support_typing FROM anon;
REVOKE ALL ON support_notifications FROM anon;
REVOKE ALL ON rate_limits FROM anon;
REVOKE ALL ON theme_purchases FROM anon;
