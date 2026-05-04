-- ============================================================
-- RLS Lockdown Phase 4: Dispute & Anomaly Tables
-- 2026-04-08
--
-- Protects remaining unprotected tables (creates any that are
-- missing, then enables RLS + admin-only policies):
--   1. ledger_anomalies   (financial drift detection)
--   2. dispute_ai_analysis (AI case analysis)
--   3. dispute_approvals   (multi-tier approval workflow)
--   4. dispute_assignments (admin case assignments)
--   5. dispute_events      (dispute audit trail)
--
-- Pattern: admin-only access via RLS + REVOKE from anon/authenticated.
-- All backend routes use supabaseAdmin (service role) which bypasses RLS.
-- ============================================================

BEGIN;

-- ─── Ensure tables exist (idempotent) ───────────────────────

CREATE TABLE IF NOT EXISTS public.ledger_anomalies (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  wallet_balance numeric NOT NULL,
  ledger_sum numeric NOT NULL,
  drift numeric NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  notes text
);
CREATE INDEX IF NOT EXISTS idx_ledger_anomalies_user_id ON public.ledger_anomalies(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_anomalies_detected_at ON public.ledger_anomalies(detected_at);

CREATE TABLE IF NOT EXISTS public.dispute_ai_analysis (
  receipt_id text PRIMARY KEY,
  ai_summary text,
  ai_risk_level text CHECK (ai_risk_level IN ('low', 'medium', 'high')),
  ai_signals jsonb DEFAULT '[]'::jsonb,
  ai_explanation jsonb DEFAULT '[]'::jsonb,
  ai_suggested_actions jsonb DEFAULT '[]'::jsonb,
  ai_last_updated timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dispute_ai_receipt ON public.dispute_ai_analysis(receipt_id);

CREATE TABLE IF NOT EXISTS public.dispute_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('accept', 'counter')),
  note text NOT NULL,
  proposed_by uuid NOT NULL,
  proposed_by_role text NOT NULL,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_by_role text,
  approved_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reject_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dispute_approvals_receipt ON public.dispute_approvals(receipt_id, status);
CREATE INDEX IF NOT EXISTS idx_dispute_approvals_pending ON public.dispute_approvals(status) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.dispute_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id text NOT NULL,
  admin_id uuid NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid,
  UNIQUE (dispute_id)
);
CREATE INDEX IF NOT EXISTS idx_dispute_assignments_dispute ON public.dispute_assignments(dispute_id);
CREATE INDEX IF NOT EXISTS idx_dispute_assignments_admin ON public.dispute_assignments(admin_id);

CREATE TABLE IF NOT EXISTS public.dispute_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id text NOT NULL,
  admin_id uuid,
  type text NOT NULL CHECK (type IN ('claim', 'release', 'status_change', 'note', 'system', 'proposal', 'approval', 'rejection')),
  message text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dispute_events_dispute ON public.dispute_events(dispute_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispute_events_admin ON public.dispute_events(admin_id);


-- ─── 1. ledger_anomalies RLS ────────────────────────────────
ALTER TABLE public.ledger_anomalies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_anomalies FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view ledger anomalies" ON public.ledger_anomalies;
CREATE POLICY "Admins can view ledger anomalies"
  ON public.ledger_anomalies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('owner', 'super_admin', 'finance_admin')
    )
  );

DROP POLICY IF EXISTS "No public insert on ledger anomalies" ON public.ledger_anomalies;
CREATE POLICY "No public insert on ledger anomalies"
  ON public.ledger_anomalies FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "No public update on ledger anomalies" ON public.ledger_anomalies;
CREATE POLICY "No public update on ledger anomalies"
  ON public.ledger_anomalies FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS "No public delete on ledger anomalies" ON public.ledger_anomalies;
CREATE POLICY "No public delete on ledger anomalies"
  ON public.ledger_anomalies FOR DELETE
  USING (false);

REVOKE ALL ON public.ledger_anomalies FROM anon, authenticated;
GRANT SELECT ON public.ledger_anomalies TO authenticated;


-- ─── 2. dispute_ai_analysis RLS ─────────────────────────────
ALTER TABLE public.dispute_ai_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_ai_analysis FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view dispute AI analysis" ON public.dispute_ai_analysis;
CREATE POLICY "Admins can view dispute AI analysis"
  ON public.dispute_ai_analysis FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('owner', 'super_admin', 'finance_admin', 'support_admin')
    )
  );

DROP POLICY IF EXISTS "No public insert on dispute AI analysis" ON public.dispute_ai_analysis;
CREATE POLICY "No public insert on dispute AI analysis"
  ON public.dispute_ai_analysis FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "No public update on dispute AI analysis" ON public.dispute_ai_analysis;
CREATE POLICY "No public update on dispute AI analysis"
  ON public.dispute_ai_analysis FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS "No public delete on dispute AI analysis" ON public.dispute_ai_analysis;
CREATE POLICY "No public delete on dispute AI analysis"
  ON public.dispute_ai_analysis FOR DELETE
  USING (false);

REVOKE ALL ON public.dispute_ai_analysis FROM anon, authenticated;
GRANT SELECT ON public.dispute_ai_analysis TO authenticated;


-- ─── 3. dispute_approvals RLS ───────────────────────────────
ALTER TABLE public.dispute_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_approvals FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view dispute approvals" ON public.dispute_approvals;
CREATE POLICY "Admins can view dispute approvals"
  ON public.dispute_approvals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('owner', 'super_admin', 'finance_admin', 'support_admin')
    )
  );

DROP POLICY IF EXISTS "Admins can insert dispute approvals" ON public.dispute_approvals;
CREATE POLICY "Admins can insert dispute approvals"
  ON public.dispute_approvals FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('owner', 'super_admin', 'finance_admin', 'support_admin')
    )
  );

DROP POLICY IF EXISTS "Admins can update dispute approvals" ON public.dispute_approvals;
CREATE POLICY "Admins can update dispute approvals"
  ON public.dispute_approvals FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('owner', 'super_admin', 'finance_admin')
    )
  );

DROP POLICY IF EXISTS "No public delete on dispute approvals" ON public.dispute_approvals;
CREATE POLICY "No public delete on dispute approvals"
  ON public.dispute_approvals FOR DELETE
  USING (false);

REVOKE ALL ON public.dispute_approvals FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.dispute_approvals TO authenticated;


-- ─── 4. dispute_assignments RLS ─────────────────────────────
ALTER TABLE public.dispute_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_assignments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view dispute assignments" ON public.dispute_assignments;
CREATE POLICY "Admins can view dispute assignments"
  ON public.dispute_assignments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('owner', 'super_admin', 'finance_admin', 'support_admin')
    )
  );

DROP POLICY IF EXISTS "Admins can insert dispute assignments" ON public.dispute_assignments;
CREATE POLICY "Admins can insert dispute assignments"
  ON public.dispute_assignments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('owner', 'super_admin', 'finance_admin', 'support_admin')
    )
  );

DROP POLICY IF EXISTS "Admins can update dispute assignments" ON public.dispute_assignments;
CREATE POLICY "Admins can update dispute assignments"
  ON public.dispute_assignments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('owner', 'super_admin', 'finance_admin', 'support_admin')
    )
  );

DROP POLICY IF EXISTS "Admins can delete dispute assignments" ON public.dispute_assignments;
CREATE POLICY "Admins can delete dispute assignments"
  ON public.dispute_assignments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('owner', 'super_admin', 'finance_admin')
    )
  );

REVOKE ALL ON public.dispute_assignments FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispute_assignments TO authenticated;


-- ─── 5. dispute_events RLS ──────────────────────────────────
ALTER TABLE public.dispute_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view dispute events" ON public.dispute_events;
CREATE POLICY "Admins can view dispute events"
  ON public.dispute_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('owner', 'super_admin', 'finance_admin', 'support_admin')
    )
  );

DROP POLICY IF EXISTS "No public insert on dispute events" ON public.dispute_events;
CREATE POLICY "No public insert on dispute events"
  ON public.dispute_events FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "No public update on dispute events" ON public.dispute_events;
CREATE POLICY "No public update on dispute events"
  ON public.dispute_events FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS "No public delete on dispute events" ON public.dispute_events;
CREATE POLICY "No public delete on dispute events"
  ON public.dispute_events FOR DELETE
  USING (false);

REVOKE ALL ON public.dispute_events FROM anon, authenticated;
GRANT SELECT ON public.dispute_events TO authenticated;

COMMIT;
