-- Creator tier progression — denormalised sales counters on profiles.
-- Updated atomically by handleCreatorProgress() in lib/creatorTier.ts
-- every time a theme_sale transitions to "approved".

alter table public.profiles
  add column if not exists total_sales   int     not null default 0,
  add column if not exists total_revenue numeric not null default 0;

comment on column public.profiles.total_sales   is 'Total approved paid theme sales (excludes promo/free unlocks and self-purchases).';
comment on column public.profiles.total_revenue is 'Lifetime creator earnings (USD) from approved theme sales.';
