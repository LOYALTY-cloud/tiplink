-- Store hero ad campaigns managed from admin

create table if not exists public.store_hero_ads (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  subtitle      text not null default '',
  badge         text not null default 'Ad',
  cta_label     text not null default 'Learn More',
  cta_href      text not null default '/store',
  cta_external  boolean not null default false,
  accent        text not null default '#22d3ee',
  motion        text not null default 'particlesSoft' check (motion in ('particlesSoft', 'moneyRain', 'heartbeat')),
  overlay       text not null default 'smoke' check (overlay in ('smoke', 'sparkle', 'dust')),
  lighting      text check (lighting in ('glow') or lighting is null),
  image_url     text,
  is_active     boolean not null default true,
  starts_at     timestamptz,  alter table store_hero_ads
    add column if not exists starts_at timestamptz;
  
  alter table store_hero_ads
    add column if not exists ends_at timestamptz;
  ends_at       timestamptz,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (starts_at is null or ends_at is null or starts_at <= ends_at)
);

create index if not exists idx_store_hero_ads_active_order
  on public.store_hero_ads (is_active, sort_order asc, created_at desc);

create index if not exists idx_store_hero_ads_window
  on public.store_hero_ads (starts_at, ends_at)
  where is_active = true;

alter table public.store_hero_ads enable row level security;

create policy "store_hero_ads: public read active in-window"
  on public.store_hero_ads
  for select
  using (
    is_active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );

comment on table public.store_hero_ads is 'Admin-managed hero ad campaigns shown on the store landing page.';
comment on column public.store_hero_ads.image_url is 'Optional image used as a soft backdrop behind animation overlays.';
