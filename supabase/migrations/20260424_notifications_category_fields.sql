-- Extend notifications table with category + contextual actor/entity fields

alter table public.notifications
  add column if not exists category  text check (category in ('payouts', 'sales', 'system', 'tips', 'security', 'support')),
  add column if not exists actor_id  uuid,
  add column if not exists entity_id uuid;

-- Backfill category for existing rows based on type
update public.notifications set category = 'tips'     where type = 'tip'      and category is null;
update public.notifications set category = 'payouts'  where type in ('payout', 'payout_requested', 'payout_processing', 'payout_paid', 'payout_failed') and category is null;
update public.notifications set category = 'security' where type = 'security' and category is null;
update public.notifications set category = 'support'  where type = 'support'  and category is null;
update public.notifications set category = 'system'   where category is null;

-- Optional index for category-filtered queries
create index if not exists idx_notifications_category
  on public.notifications(user_id, category, created_at desc);
