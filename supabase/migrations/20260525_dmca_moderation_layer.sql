-- DMCA Moderation Layer
-- 1. Theme soft-moderation boolean flags (is_under_review, is_removed)
-- 2. dmca_audit_logs — immutable record of every admin action on a DMCA report
-- 3. related_dmca_id on creator_strikes — link strikes back to the DMCA report

-- ── 1. Theme moderation flags ─────────────────────────────────────────────────
-- is_under_review: admin can quickly flag a theme for review without changing
--                  the public status (quick-hide during investigation)
-- is_removed:      soft-delete — theme is hidden from marketplace but record
--                  and all evidence is preserved for legal/appeals

ALTER TABLE public.themes
  ADD COLUMN IF NOT EXISTS is_under_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_removed      boolean NOT NULL DEFAULT false;

-- Index for marketplace queries that filter out removed/under-review content
CREATE INDEX IF NOT EXISTS idx_themes_is_removed      ON public.themes (is_removed)      WHERE is_removed = true;
CREATE INDEX IF NOT EXISTS idx_themes_is_under_review ON public.themes (is_under_review) WHERE is_under_review = true;

COMMENT ON COLUMN public.themes.is_under_review IS
  'Set true by admins to hide theme from marketplace during investigation without changing public status.';
COMMENT ON COLUMN public.themes.is_removed IS
  'Soft-delete flag. Hides theme from all public surfaces. Record preserved for evidence/appeals.';

-- ── 2. Link creator_strikes back to the DMCA report that triggered them ───────

ALTER TABLE public.creator_strikes
  ADD COLUMN IF NOT EXISTS related_dmca_id uuid REFERENCES public.dmca_reports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_creator_strikes_dmca_id
  ON public.creator_strikes (related_dmca_id)
  WHERE related_dmca_id IS NOT NULL;

-- ── 3. DMCA audit log ─────────────────────────────────────────────────────────
-- Immutable append-only record of every admin action on a DMCA report.
-- Provides legal defensibility: who changed what, and when.

CREATE TABLE IF NOT EXISTS public.dmca_audit_logs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id     uuid        NOT NULL REFERENCES public.dmca_reports(id) ON DELETE CASCADE,
  admin_id      uuid        NOT NULL,  -- references auth.users(id) via service_role
  action        text        NOT NULL,  -- 'status_change' | 'priority_change' | 'notes_update' | 'viewed'
  changes       jsonb,                 -- { field, old_value, new_value }
  ip_address    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dmca_audit_logs_report_id  ON public.dmca_audit_logs (report_id);
CREATE INDEX IF NOT EXISTS idx_dmca_audit_logs_admin_id   ON public.dmca_audit_logs (admin_id);
CREATE INDEX IF NOT EXISTS idx_dmca_audit_logs_created_at ON public.dmca_audit_logs (created_at DESC);

-- Service-role only — no direct user access
ALTER TABLE public.dmca_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dmca_audit_logs: service_role only"
  ON public.dmca_audit_logs AS PERMISSIVE FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON public.dmca_audit_logs FROM public, anon, authenticated;
GRANT ALL  ON public.dmca_audit_logs TO service_role;

COMMENT ON TABLE public.dmca_audit_logs IS
  'Immutable audit trail for all admin actions on DMCA reports. Never delete rows.';
