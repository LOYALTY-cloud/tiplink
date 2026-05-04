-- Theme market activation toggle
-- Allows creators to pause sales and promo code usage per theme.

alter table public.themes
  add column if not exists is_market_active boolean not null default true;

comment on column public.themes.is_market_active is 'TRUE when the theme can be sold and used with promo codes.';

create index if not exists idx_themes_market_active
  on public.themes (user_id, is_market_active);
