-- The withdrawals_status_check constraint (undocumented in prior migrations —
-- schema drift) only allowed 'pending', 'paid', 'failed', 'canceled'. The app
-- has always inserted 'approved' (immediate payout) and 'under_review'
-- (high-risk hold), so every withdrawal reaching either path 500'd at the
-- insert step before Stripe was ever called.
alter table public.withdrawals
  drop constraint if exists withdrawals_status_check;

alter table public.withdrawals
  add constraint withdrawals_status_check
  check (status in ('pending', 'approved', 'paid', 'failed', 'canceled', 'under_review'));
