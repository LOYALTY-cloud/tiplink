-- ============================================================
-- FULL SECURITY CONFIG PACK  (idempotent — safe to re-run)
--
-- Builds on top of existing migrations:
--   20260307_add_profiles_rls.sql
--   20260319_production_rls_lockdown.sql
--   20260401_rls_lockdown_phase2.sql
--   20260401_security_hardening_search_path.sql
--
-- What this migration adds:
--   1) is_admin() helper function (reusable across policies)
--   2) Profiles: replace "viewable by everyone" (USING true)
--      with self + admin-only read; add role-escalation guard
--   3) Stronger REVOKE grants on sensitive tables
--   4) Admin actions: full CRUD for admins (was SELECT only)
--   5) Ledger: explicit deny-insert policy for client
--   6) Final privilege cleanup
--
-- ⚠ BREAKING CHANGE — profiles SELECT
--   The old policy "Profiles are viewable by everyone" allowed
--   anon users to look up any profile (needed by /[handle]).
--   This pack replaces it with self+admin only.
--   IF your public tipping page (/[handle]) uses the anon key,
--   you must EITHER:
--     a) Switch that route to use the service role key, OR
--     b) Add a narrow anon policy for handle lookups (see §3b)
-- ============================================================


-- ============================
-- §1  HELPER: is_admin()
-- Reusable in all RLS policies. SECURITY DEFINER so it can
-- read profiles even when calling user has no SELECT on profiles.
-- ============================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role IN (
        'owner',
        'super_admin',
        'admin',
        'finance_admin',
        'support_admin'
      )
  );
$$;


-- ============================
-- §2  ENABLE RLS (no-op if already enabled)
-- ============================
ALTER TABLE profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE theme_purchases       ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions_ledger   ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_typing        ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_actions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits           ENABLE ROW LEVEL SECURITY;


-- ============================
-- §3  PROFILES — self + admin read; guarded update
-- ============================

-- §3a  Drop the old wide-open policy
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "profile_select_self"              ON profiles;
DROP POLICY IF EXISTS "profile_update_self"              ON profiles;

-- Self or admin can read
CREATE POLICY "profile_select_self"
  ON profiles FOR SELECT
  USING (
    profiles.user_id = auth.uid()
    OR public.is_admin()
  );

-- §3b  Narrow anon-only read for the /[handle] tipping page (SSR).
--       Scoped TO anon so authenticated users cannot read arbitrary
--       profiles — they only get self+admin via profile_select_self.
--       REMOVE this policy if you switch /[handle] to service role.
DROP POLICY IF EXISTS "anon_read_public_profiles"            ON profiles;
DROP POLICY IF EXISTS "public_can_view_profiles_by_handle"   ON profiles;
CREATE POLICY "public_can_view_profiles_by_handle"
  ON profiles FOR SELECT
  TO anon
  USING (
    handle IS NOT NULL
  );

-- Update own profile only; WITH CHECK prevents role self-escalation
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "profile_update_self"
  ON profiles FOR UPDATE
  USING  (profiles.user_id = auth.uid())
  WITH CHECK (
    profiles.user_id = auth.uid()
    -- Block clients from changing their own role
    AND (role IS NOT DISTINCT FROM (SELECT p.role FROM profiles p WHERE p.user_id = auth.uid()))
  );


-- ============================
-- §4  THEME PURCHASES (already has policies; ensure consistency)
-- ============================
DROP POLICY IF EXISTS "Users can view own theme purchases"  ON theme_purchases;
DROP POLICY IF EXISTS "Users can insert own theme purchases" ON theme_purchases;
DROP POLICY IF EXISTS "Admins can view all theme purchases"  ON theme_purchases;
DROP POLICY IF EXISTS "theme_select" ON theme_purchases;
DROP POLICY IF EXISTS "theme_insert" ON theme_purchases;

CREATE POLICY "theme_select"
  ON theme_purchases FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "theme_insert"
  ON theme_purchases FOR INSERT
  WITH CHECK (user_id = auth.uid());


-- ============================
-- §5  TRANSACTIONS LEDGER (highly sensitive)
-- ============================
DROP POLICY IF EXISTS "Users can view own transactions"  ON transactions_ledger;
DROP POLICY IF EXISTS "Admins can view all transactions" ON transactions_ledger;
DROP POLICY IF EXISTS "ledger_select_self"               ON transactions_ledger;
DROP POLICY IF EXISTS "ledger_admin_read"                ON transactions_ledger;
DROP POLICY IF EXISTS "ledger_no_client_insert"          ON transactions_ledger;

-- Users read own
CREATE POLICY "ledger_select_self"
  ON transactions_ledger FOR SELECT
  USING (user_id = auth.uid());

-- Admin read all
CREATE POLICY "ledger_admin_read"
  ON transactions_ledger FOR SELECT
  USING (public.is_admin());

-- No direct client inserts (service role bypasses RLS)
CREATE POLICY "ledger_no_client_insert"
  ON transactions_ledger FOR INSERT
  WITH CHECK (false);


-- ============================
-- §6  SUPPORT SESSIONS
-- ============================
DROP POLICY IF EXISTS "Users can view own support sessions"  ON support_sessions;
DROP POLICY IF EXISTS "Users can insert own support sessions" ON support_sessions;
DROP POLICY IF EXISTS "Admins can view all support sessions"  ON support_sessions;
DROP POLICY IF EXISTS "Admins can update support sessions"    ON support_sessions;
DROP POLICY IF EXISTS "sessions_select" ON support_sessions;
DROP POLICY IF EXISTS "sessions_insert" ON support_sessions;

CREATE POLICY "sessions_select"
  ON support_sessions FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "sessions_insert"
  ON support_sessions FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Admin can update (close, assign, etc.)
DROP POLICY IF EXISTS "sessions_admin_update" ON support_sessions;
CREATE POLICY "sessions_admin_update"
  ON support_sessions FOR UPDATE
  USING (public.is_admin());


-- ============================
-- §7  SUPPORT MESSAGES
-- ============================
DROP POLICY IF EXISTS "Users can view messages in own session"    ON support_messages;
DROP POLICY IF EXISTS "Users can insert messages in own session"  ON support_messages;
DROP POLICY IF EXISTS "Admins can view all support messages"      ON support_messages;
DROP POLICY IF EXISTS "Admins can insert support messages"        ON support_messages;
DROP POLICY IF EXISTS "Admins can update support messages"        ON support_messages;
DROP POLICY IF EXISTS "messages_select" ON support_messages;
DROP POLICY IF EXISTS "messages_insert" ON support_messages;

CREATE POLICY "messages_select"
  ON support_messages FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM support_sessions s
      WHERE s.id = support_messages.session_id
        AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "messages_insert"
  ON support_messages FOR INSERT
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM support_sessions s
      WHERE s.id = support_messages.session_id
        AND s.user_id = auth.uid()
    )
  );


-- ============================
-- §8  SUPPORT TYPING + NOTIFICATIONS
-- ============================
DROP POLICY IF EXISTS "Users can view typing in own session"  ON support_typing;
DROP POLICY IF EXISTS "Users can update typing in own session" ON support_typing;
DROP POLICY IF EXISTS "Admins can view all typing"            ON support_typing;
DROP POLICY IF EXISTS "Admins can update all typing"          ON support_typing;
DROP POLICY IF EXISTS "typing_select" ON support_typing;
DROP POLICY IF EXISTS "typing_upsert" ON support_typing;

CREATE POLICY "typing_select"
  ON support_typing FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM support_sessions s
      WHERE s.id = support_typing.session_id
        AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "typing_upsert"
  ON support_typing FOR UPDATE
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM support_sessions s
      WHERE s.id = support_typing.session_id
        AND s.user_id = auth.uid()
    )
  );

-- Users/admins can insert typing indicators
DROP POLICY IF EXISTS "typing_insert" ON support_typing;
CREATE POLICY "typing_insert"
  ON support_typing FOR INSERT
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM support_sessions s
      WHERE s.id = support_typing.session_id
        AND s.user_id = auth.uid()
    )
  );

-- Notifications: admin-only
DROP POLICY IF EXISTS "Admins can view support notifications"   ON support_notifications;
DROP POLICY IF EXISTS "Admins can insert support notifications" ON support_notifications;
DROP POLICY IF EXISTS "Admins can update support notifications" ON support_notifications;
DROP POLICY IF EXISTS "notifications_select" ON support_notifications;

CREATE POLICY "notifications_select"
  ON support_notifications FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "notifications_write" ON support_notifications;
CREATE POLICY "notifications_write"
  ON support_notifications FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ============================
-- §9  ADMIN TABLES — admin full CRUD
-- ============================
DROP POLICY IF EXISTS "Admins can view admin actions" ON admin_actions;
DROP POLICY IF EXISTS "admin_only_access"            ON admin_actions;

CREATE POLICY "admin_only_access"
  ON admin_actions FOR ALL
  USING  (public.is_admin())
  WITH CHECK (public.is_admin());


-- ============================
-- §10  RATE LIMITS — fully locked
-- ============================
DROP POLICY IF EXISTS "Deny all client access to rate_limits" ON rate_limits;
DROP POLICY IF EXISTS "rate_limits_block_all"                 ON rate_limits;

CREATE POLICY "rate_limits_block_all"
  ON rate_limits FOR ALL
  USING (false)
  WITH CHECK (false);


-- ============================
-- §11  REVOKE DANGEROUS DEFAULT ACCESS
-- ============================
REVOKE ALL ON theme_purchases       FROM anon, authenticated;
REVOKE ALL ON transactions_ledger   FROM anon, authenticated;
REVOKE ALL ON rate_limits           FROM anon, authenticated;
REVOKE ALL ON support_messages      FROM anon;
REVOKE ALL ON support_sessions      FROM anon;
REVOKE ALL ON support_typing        FROM anon;
REVOKE ALL ON support_notifications FROM anon;
REVOKE ALL ON admin_actions         FROM anon;

-- Re-grant SELECT/INSERT so RLS policies can still evaluate
GRANT SELECT, INSERT         ON theme_purchases     TO authenticated;
GRANT SELECT                 ON transactions_ledger  TO authenticated;
GRANT SELECT, INSERT, UPDATE ON support_sessions     TO authenticated;
GRANT SELECT, INSERT         ON support_messages     TO authenticated;
GRANT SELECT, INSERT, UPDATE ON support_typing       TO authenticated;
GRANT SELECT, INSERT, UPDATE ON support_notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE ON admin_actions        TO authenticated;


-- ============================
-- §12  FINAL STATE VERIFICATION QUERY
-- Run this after applying to confirm all public tables have RLS enabled.
-- (Uncomment to execute manually in SQL Editor)
-- ============================
-- SELECT schemaname, tablename, rowsecurity
--   FROM pg_tables
--  WHERE schemaname = 'public'
--  ORDER BY tablename;
