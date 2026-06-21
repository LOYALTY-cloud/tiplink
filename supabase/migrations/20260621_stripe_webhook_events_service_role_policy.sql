-- Ensure webhook event tables remain writable by service_role when FORCE RLS is enabled.
-- This prevents production webhook processing from failing if BYPASSRLS assumptions change.

alter table if exists public.stripe_webhook_events enable row level security;
alter table if exists public.stripe_webhook_events force row level security;

drop policy if exists "service_role_all" on public.stripe_webhook_events;
create policy "service_role_all"
on public.stripe_webhook_events
for all
to service_role
using (true)
with check (true);

alter table if exists public.stripe_failed_webhook_events enable row level security;
alter table if exists public.stripe_failed_webhook_events force row level security;

drop policy if exists "service_role_all" on public.stripe_failed_webhook_events;
create policy "service_role_all"
on public.stripe_failed_webhook_events
for all
to service_role
using (true)
with check (true);
