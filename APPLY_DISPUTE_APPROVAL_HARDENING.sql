-- COPY AND PASTE THIS INTO YOUR SUPABASE SQL EDITOR
-- Go to: https://supabase.com/dashboard/project/cjakxygbgijsknoadrrs/sql/new
--
-- PURPOSE: Fix two-admin approval race conditions and DB policy scope.

-- 1) Auto-resolve duplicate open pending approvals (keep newest per receipt).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY receipt_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.dispute_approvals
  WHERE status = 'pending'
    AND approved_by IS NULL
)
UPDATE public.dispute_approvals d
SET
  status = 'rejected',
  reject_note = COALESCE(d.reject_note, 'Auto-rejected duplicate pending approval during hardening')
FROM ranked r
WHERE d.id = r.id
  AND r.rn > 1;

-- 2) Enforce one open pending approval per dispute.
CREATE UNIQUE INDEX IF NOT EXISTS idx_dispute_approvals_one_open_pending
  ON public.dispute_approvals(receipt_id)
  WHERE status = 'pending' AND approved_by IS NULL;

-- 3) Restrict INSERT policy to refund-capable admin roles.
DROP POLICY IF EXISTS "Admins can insert dispute approvals" ON public.dispute_approvals;
CREATE POLICY "Admins can insert dispute approvals"
  ON public.dispute_approvals FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('owner', 'super_admin', 'finance_admin')
    )
  );
