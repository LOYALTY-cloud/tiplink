-- Marketplace discovery engine fields for creator stores

alter table public.creator_stores
  add column if not exists category text not null default 'general',
  add column if not exists total_sales int not null default 0,
  add column if not exists total_revenue numeric not null default 0,
  add column if not exists followers int not null default 0,
  add column if not exists featured boolean not null default false;

create index if not exists idx_creator_stores_featured
  on public.creator_stores (featured)
  where is_active = true and featured = true;

create index if not exists idx_creator_stores_category
  on public.creator_stores (category)
  where is_active = true;

comment on column public.creator_stores.category is 'Marketplace category label (general, gaming, fashion, luxury, neon).';
comment on column public.creator_stores.total_sales is 'Store-level sales count used for marketplace ranking.';
comment on column public.creator_stores.total_revenue is 'Store-level revenue used for marketplace ranking.';
comment on column public.creator_stores.followers is 'Store followers count used for marketplace ranking.';
comment on column public.creator_stores.featured is 'Admin-curated featured placement in marketplace.';