-- Account freeze audit trail + admin freeze notifications
-- Applied: 2026-04-05

-- ─────────────────────────────────────────────────────
-- 1. account_freeze_logs — dedicated audit table
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.account_freeze_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  action text NOT NULL DEFAULT 'freeze',  -- freeze | unfreeze
  freeze_level text,                       -- soft | hard
  reason text,
  triggered_by text NOT NULL DEFAULT 'system',  -- system | admin | self
  admin_id uuid,                           -- if triggered by admin
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_freeze_logs_user_id ON public.account_freeze_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_freeze_logs_created_at ON public.account_freeze_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_freeze_logs_action ON public.account_freeze_logs(action);

-- ─────────────────────────────────────────────────────
-- 2. RLS: admin read-only, no client access
-- ─────────────────────────────────────────────────────
ALTER TABLE public.account_freeze_logs ENABLE ROW LEVEL SECURITY;

-- Admin can read all
CREATE POLICY "admin_read_freeze_logs"
  ON public.account_freeze_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.role IN ('owner', 'super_admin', 'admin', 'finance_admin', 'support_admin')
    )
  );

-- Users can see their own freeze history
CREATE POLICY "user_read_own_freeze_logs"
  ON public.account_freeze_logs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- No client inserts — server-side only via service role
