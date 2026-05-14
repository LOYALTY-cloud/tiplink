-- Track Stripe transfer details on theme_sales rows.
-- When a creator has a connected Stripe account, the platform creates a
-- stripe.transfers.create() after payment so the creator's share lands in
-- their Stripe balance directly.  These columns record that operation.

alter table public.theme_sales
  add column if not exists stripe_transfer_id   text,
  add column if not exists transfer_status      text    not null default 'pending',
  add column if not exists transfer_eligible_at timestamptz;

comment on column public.theme_sales.stripe_transfer_id   is 'Stripe transfer object ID (tr_...) — set once transfer is created.';
comment on column public.theme_sales.transfer_status      is 'pending | transferred | skipped (no connected account) | failed';
comment on column public.theme_sales.transfer_eligible_at is 'Earliest timestamp at which the transfer may be executed (fraud hold window).';
