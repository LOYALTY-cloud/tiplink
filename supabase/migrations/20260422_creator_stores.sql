-- Creator Store system
-- A store is the public marketplace presence for a PRO+ creator.
-- Activated by a Stripe subscription; deactivated on cancellation.

-- ── 1. creator_stores ─────────────────────────────────────────────────────────

create table if not exists public.creator_stores (
  id                     uuid        primary key default gen_random_uuid(),
  user_id                uuid        unique not null references auth.users(id) on delete cascade,
  store_name             text,
  slug                   text        unique,
  description            text,
  is_active              boolean     not null default false,
  stripe_subscription_id text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- slug must be URL-safe: lowercase letters, digits, hyphens, 3–48 chars.
alter table public.creator_stores
  add constraint creator_stores_slug_format
    check (slug is null or slug ~ '^[a-z0-9][a-z0-9\-]{1,46}[a-z0-9]$');

create index if not exists idx_creator_stores_user_id on public.creator_stores (user_id);
create index if not exists idx_creator_stores_slug    on public.creator_stores (slug) where is_active = true;

-- RLS
alter table public.creator_stores enable row level security;

-- Owners can read their own store
create policy "creator_stores: owner select"
  on public.creator_stores for select
  using (auth.uid() = user_id);

-- Public: anyone can read active stores (for marketplace pages)
create policy "creator_stores: public read active"
  on public.creator_stores for select
  using (is_active = true);

comment on table  public.creator_stores                        is 'One store per PRO+ creator. Activated by a paid Stripe subscription.';
comment on column public.creator_stores.slug                   is 'URL slug for /store/<slug>. Lowercase letters, digits, hyphens.';
comment on column public.creator_stores.stripe_subscription_id is 'Stripe subscription object ID. NULL until first successful payment.';

-- ── 2. Add store_id to themes ─────────────────────────────────────────────────

alter table public.themes
  add column if not exists store_id uuid references public.creator_stores(id) on delete set null;

create index if not exists idx_themes_store_id on public.themes (store_id) where store_id is not null;

comment on column public.themes.store_id is 'Set when a creator publishes this theme to their store. NULL = not listed.';
