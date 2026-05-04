-- COPY AND PASTE THIS INTO YOUR SUPABASE SQL EDITOR
-- PURPOSE: Prevent duplicate pending refund requests and clean up existing duplicates.

-- 1) Auto-resolve duplicate pending requests (keep newest per tip_intent_id).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY tip_intent_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.refund_requests
  WHERE status = 'pending'
)
UPDATE public.refund_requests r
SET
  status = 'rejected',
  note = COALESCE(r.note, 'Auto-rejected duplicate pending refund request during hardening'),
  locked_at = NULL,
  locked_by = NULL
FROM ranked d
WHERE r.id = d.id
  AND d.rn > 1;

-- 2) Enforce one open pending request per tip.
CREATE UNIQUE INDEX IF NOT EXISTS idx_refund_requests_one_open_pending
  ON public.refund_requests(tip_intent_id)
  WHERE status = 'pending';
