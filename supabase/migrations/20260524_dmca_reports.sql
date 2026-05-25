-- ============================================================
-- DMCA Reports table
-- Stores DMCA / IP complaint form submissions.
-- RLS: all public access denied — only service role.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.dmca_reports (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Submitter (optional — anon submissions allowed)
  user_id                 uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Contact info
  first_name              text        NOT NULL,
  last_name               text        NOT NULL,
  organization            text,
  email                   text        NOT NULL,
  phone                   text,

  -- Copyright details
  copyrighted_work        text        NOT NULL,
  original_content_url    text,

  -- Infringing content
  infringing_content_url  text        NOT NULL,
  infringement_details    text        NOT NULL,

  -- Evidence (storage paths in private dmca-evidence bucket)
  evidence_urls           text[]      NOT NULL DEFAULT '{}',

  -- Legal signature
  electronic_signature    text        NOT NULL,

  -- Moderation
  status                  text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'reviewing', 'resolved', 'rejected')),
  priority                text        NOT NULL DEFAULT 'normal'
                            CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  moderator_notes         text,
  reviewed_by             uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at             timestamptz,

  created_at              timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dmca_reports_status    ON public.dmca_reports(status);
CREATE INDEX IF NOT EXISTS idx_dmca_reports_created   ON public.dmca_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dmca_reports_user_id   ON public.dmca_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_dmca_reports_email     ON public.dmca_reports(email);

-- RLS: block all public/anon access — service role only
ALTER TABLE public.dmca_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dmca_reports FORCE ROW LEVEL SECURITY;

CREATE POLICY "dmca_reports_deny_public"
  ON public.dmca_reports
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);
