-- ─────────────────────────────────────────────
-- Reports / Moderation Queue
-- Creator-platform focused: payments, themes,
-- impersonation, fraud are the highest-risk targets.
-- ─────────────────────────────────────────────

-- ENUMs (safer than raw text — prevents invalid values)
DO $$ BEGIN
  CREATE TYPE report_status   AS ENUM ('pending', 'reviewing', 'resolved', 'dismissed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE report_priority AS ENUM ('low', 'normal', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Core table
CREATE TABLE IF NOT EXISTS public.reports (
  id                     uuid            PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who filed the report (NULL-safe: account may be deleted later)
  reporter_id            uuid            REFERENCES profiles(user_id) ON DELETE SET NULL,

  -- What was reported
  target_type            text            NOT NULL
    CHECK (target_type IN ('creator', 'user', 'transaction', 'theme', 'post', 'comment')),
  target_id              uuid            NOT NULL,

  -- Owner of the reported content (creator of the theme, sender of the transaction, etc.)
  target_owner_id        uuid            REFERENCES profiles(user_id) ON DELETE SET NULL,

  -- Report payload
  reason                 text            NOT NULL,
  details                text,
  evidence_urls          text[],

  -- Moderation state
  status                 report_status   NOT NULL DEFAULT 'pending',
  priority               report_priority NOT NULL DEFAULT 'normal',
  requires_manual_review boolean         NOT NULL DEFAULT false,

  -- Resolution
  moderation_action      text,
  resolved_notes         text,
  reviewed_by            uuid            REFERENCES profiles(user_id) ON DELETE SET NULL,
  reviewed_at            timestamptz,

  created_at             timestamptz     NOT NULL DEFAULT now()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_reports_status         ON public.reports (status);
CREATE INDEX IF NOT EXISTS idx_reports_reporter_id    ON public.reports (reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_target_id      ON public.reports (target_id);
CREATE INDEX IF NOT EXISTS idx_reports_target_owner   ON public.reports (target_owner_id);
CREATE INDEX IF NOT EXISTS idx_reports_created_at     ON public.reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_priority       ON public.reports (priority) WHERE status = 'pending';

-- Anti-spam: one pending report per reporter+target+type (reporter can re-report after resolution)
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_dedup
  ON public.reports (reporter_id, target_id, target_type)
  WHERE status = 'pending';

-- RLS: users can only read their own submissions; all writes via service role
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reporter_select" ON public.reports;
CREATE POLICY "reporter_select" ON public.reports
  FOR SELECT USING (reporter_id = auth.uid());

-- Revoke direct access from anon/authenticated (backend only)
REVOKE INSERT, UPDATE, DELETE ON public.reports FROM anon, authenticated;
