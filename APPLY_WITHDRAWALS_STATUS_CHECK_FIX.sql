-- COPY AND PASTE THIS INTO YOUR SUPABASE SQL EDITOR
-- Go to: https://supabase.com/dashboard/project/cjakxygbgijsknoadrrs/sql/new
--
-- PURPOSE: withdrawals_status_check currently only allows
--          'pending', 'paid', 'failed', 'canceled' — but the withdrawal API
--          has always inserted 'approved' (any immediately-executed payout,
--          instant or standard) and 'under_review' (high-risk hold). Every
--          withdrawal reaching either path has been failing at the insert
--          step with a 500 "Withdrawal failed" error, before Stripe is ever
--          called. This constraint isn't defined in any tracked migration
--          file (schema drift), so it's shipped here as a standalone fix.

ALTER TABLE public.withdrawals
  DROP CONSTRAINT IF EXISTS withdrawals_status_check;

ALTER TABLE public.withdrawals
  ADD CONSTRAINT withdrawals_status_check
  CHECK (status IN ('pending', 'approved', 'paid', 'failed', 'canceled', 'under_review'));

-- ✅ After running this:
--   • Instant withdrawals that pass Stripe's own instant-balance check will
--     actually insert and execute instead of 500ing.
--   • High-risk withdrawals routed to manual review will insert correctly too.
