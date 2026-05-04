-- Prevent duplicate creator earnings rows from repeated webhook processing.
-- Allows NULLs but enforces uniqueness when stripe_session_id is present.

create unique index if not exists idx_theme_sales_stripe_session_unique
  on public.theme_sales (stripe_session_id)
  where stripe_session_id is not null;
