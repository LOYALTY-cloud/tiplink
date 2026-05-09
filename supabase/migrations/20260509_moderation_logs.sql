-- Moderation logs table for AI audit trail
-- Every moderation decision (AI or human) is logged here for legal/appeal use.

CREATE TABLE IF NOT EXISTS public.moderation_logs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id     uuid        REFERENCES public.themes(id) ON DELETE CASCADE,
  creator_id   uuid        REFERENCES auth.users(id)   ON DELETE CASCADE,
  event_type   text        NOT NULL, -- 'ai_scan', 'auto_flag', 'human_approve', 'human_flag', 'human_strike', 'appeal_approved', 'appeal_rejected'
  risk_score   integer,
  ai_reason    text,
  reviewed_by  uuid        REFERENCES auth.users(id),
  metadata     jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moderation_logs_theme_id   ON public.moderation_logs (theme_id);
CREATE INDEX IF NOT EXISTS idx_moderation_logs_creator_id ON public.moderation_logs (creator_id);
CREATE INDEX IF NOT EXISTS idx_moderation_logs_created_at ON public.moderation_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_logs_event_type ON public.moderation_logs (event_type);

ALTER TABLE public.moderation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "moderation_logs: service_role only"
  ON public.moderation_logs AS PERMISSIVE FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON public.moderation_logs FROM public, anon, authenticated;
GRANT ALL ON public.moderation_logs TO service_role;

-- Add downloads column to themes if missing
ALTER TABLE public.themes ADD COLUMN IF NOT EXISTS downloads integer NOT NULL DEFAULT 0;
-- Add updated_at if missing
ALTER TABLE public.themes ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
