-- Curated marketplace categories for themes.
create table if not exists public.theme_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  created_at timestamptz not null default now()
);

insert into public.theme_categories (name, slug)
values
  ('Luxury', 'luxury'),
  ('Dark', 'dark'),
  ('Neon', 'neon'),
  ('Minimal', 'minimal'),
  ('Aesthetic', 'aesthetic'),
  ('Anime', 'anime'),
  ('Street', 'street'),
  ('Soft', 'soft'),
  ('Futuristic', 'futuristic')
on conflict (slug) do update
set name = excluded.name;

alter table public.themes
  add column if not exists category_id uuid references public.theme_categories(id) on delete set null,
  add column if not exists is_verified boolean not null default false;

create index if not exists idx_themes_category_id
  on public.themes (category_id)
  where category_id is not null;

create index if not exists idx_themes_verified
  on public.themes (is_verified)
  where is_verified = true;

comment on column public.themes.category_id is 'Primary curated category for marketplace filtering.';
comment on column public.themes.is_verified is 'Admin quality verification flag for marketplace curation.';