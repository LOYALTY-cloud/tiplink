-- READ-ONLY verification checks for refund request pending hardening.

SELECT
  'unique open pending refund request index exists' AS check_name,
  EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_refund_requests_one_open_pending'
  ) AS ok;

SELECT
  'duplicate pending refund requests = 0' AS check_name,
  NOT EXISTS (
    SELECT 1
    FROM public.refund_requests
    WHERE status = 'pending'
    GROUP BY tip_intent_id
    HAVING COUNT(*) > 1
  ) AS ok;
