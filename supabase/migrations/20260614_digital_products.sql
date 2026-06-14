-- digital_products: maps a creator + price → a file to deliver on payment
create table if not exists public.digital_products (
  id            uuid primary key default gen_random_uuid(),
  creator_handle text not null,              -- e.g. 'gfebook'
  creator_user_id uuid references profiles(user_id) on delete cascade,
  title         text not null,               -- display name of the product
  price_cents   integer not null,            -- exact amount that triggers delivery (e.g. 999 = $9.99)
  storage_path  text not null,               -- path in Supabase storage bucket 'digital-products'
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create index idx_digital_products_handle on public.digital_products (creator_handle);
create index idx_digital_products_user   on public.digital_products (creator_user_id);

-- Seed: @gfebook ebook at $9.99
-- NOTE: creator_user_id is set by the post-deploy SQL below (requires live profile lookup)
insert into public.digital_products (creator_handle, title, price_cents, storage_path, active)
values (
  'gfebook',
  'GOLDI MAYKN RESOURCE GUIDE',
  999,
  'MAYKN_Second_Life_Beginner_Resource_Guide.pdf',
  true
);

-- Run after insert to link the profile:
-- UPDATE digital_products
--   SET creator_user_id = (SELECT user_id FROM profiles WHERE handle = 'gfebook')
-- WHERE creator_handle = 'gfebook';
