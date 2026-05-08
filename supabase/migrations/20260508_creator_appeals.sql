-- Creator Appeal System
-- Allows creators to appeal a flagged/removed theme to admins.
-- One appeal per theme per creator; admins approve or reject with a note.

CREATE TABLE IF NOT EXISTS public.theme_appeals (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id     uuid        NOT NULL REFERENCES public.themes(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason       text        NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 2000),
  status       text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note   text,
  reviewed_by  uuid        REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  reviewed_at  timestamptz,
  -- One open appeal per theme per creator
  CONSTRAINT uq_theme_appeal_user UNIQUE (theme_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_theme_appeals_status     ON public.theme_appeals (status);
CREATE INDEX IF NOT EXISTS idx_theme_appeals_user_id    ON public.theme_appeals (user_id);
CREATE INDEX IF NOT EXISTS idx_theme_appeals_theme_id   ON public.theme_appeals (theme_id);
CREATE INDEX IF NOT EXISTS idx_theme_appeals_created_at ON public.theme_appeals (created_at DESC);

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.theme_appeals ENABLE ROW LEVEL SECURITY;

-- Creators: select own appeals
CREATE POLICY "theme_appeals: creator select"
  ON public.theme_appeals FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Creators: insert own appeals (only for themes they own)
CREATE POLICY "theme_appeals: creator insert"
  ON public.theme_appeals FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.themes
      WHERE id = theme_id AND user_id = auth.uid()
    )
  );

-- Service role: full access (used by admin API routes)
CREATE POLICY "theme_appeals: service_role all"
  ON public.theme_appeals AS PERMISSIVE FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
