-- Fix store invoice upsert conflict target for PostgREST onConflict.
-- Replaces partial unique index with a full unique index so onConflict=stripe_invoice_id works.

drop index if exists public.uq_store_invoices_stripe_invoice_id;

create unique index if not exists uq_store_invoices_stripe_invoice_id
  on public.store_invoices (stripe_invoice_id);
  