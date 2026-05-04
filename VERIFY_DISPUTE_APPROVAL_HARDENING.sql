-- READ-ONLY verification checks for dispute approval hardening.

SELECT
  'unique open pending index exists' AS check_name,
  EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_dispute_approvals_one_open_pending'
  ) AS ok;

SELECT
  'insert policy excludes support_admin' AS check_name,
  EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'dispute_approvals'
      AND policyname = 'Admins can insert dispute approvals'
      AND qual IS NULL
      AND with_check ILIKE '%owner%super_admin%finance_admin%'
  ) AS ok;

SELECT
  'duplicate open pending approvals = 0' AS check_name,
  NOT EXISTS (
    SELECT 1
    FROM public.dispute_approvals
    WHERE status = 'pending' AND approved_by IS NULL
    GROUP BY receipt_id
    HAVING COUNT(*) > 1
  ) AS ok;
