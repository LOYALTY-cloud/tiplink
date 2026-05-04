-- Theme Marketplace — unlocks, promo codes, sales revenue tracking.
-- Works alongside the existing theme_purchases table (preset themes).
-- This is for custom creator-built themes (UUID-keyed from the `themes` table).

-- ── 1. Extend `themes` table ─────────────────────────────────────────────────

alter table public.themes
  add column if not exists price         numeric(10,2),          -- null = not for sale
  add column if not exists is_public     boolean not null default false,
  add column if not exists unlock_count  int     not null default 0;

comment on column public.themes.price        is 'USD price to purchase this theme. NULL = not listed.';
comment on column public.themes.is_public    is 'TRUE = visible in the marketplace.';
comment on column public.themes.unlock_count is 'Denormalised count of paid+promo unlocks.';

-- ── 2. theme_unlocks ─────────────────────────────────────────────────────────

create table if not exists public.theme_unlocks (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  theme_id    uuid        not null references public.themes(id) on delete cascade,
  source      text        not null check (source in ('promo', 'payment')),
  amount_paid numeric(10,2),
  created_at  timestamptz not null default now()
);

-- Core invariant: one unlock per user per theme.
create unique index if not exists uniq_user_theme
  on public.theme_unlocks (user_id, theme_id);

create index if not exists idx_theme_unlocks_user_id
  on public.theme_unlocks (user_id);

comment on table  public.theme_unlocks              is 'Tracks which custom (UUID) themes a user has unlocked via promo or payment.';
comment on column public.theme_unlocks.source       is '"promo" or "payment".';
comment on column public.theme_unlocks.amount_paid  is 'USD paid; 0 or NULL for promo unlocks.';

-- ── 3. promo_codes ───────────────────────────────────────────────────────────

create table if not exists public.promo_codes (
  id         uuid        primary key default gen_random_uuid(),
  code       text        not null unique,
  theme_id   uuid        not null references public.themes(id) on delete cascade,
  is_active  boolean     not null default true,
  expires_at timestamptz,
  max_uses   int,
  uses       int         not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_promo_codes_code
  on public.promo_codes (code);

comment on table public.promo_codes is 'Single-use or limited promo codes that unlock a specific custom theme.';

-- ── 4. theme_sales ───────────────────────────────────────────────────────────

create table if not exists public.theme_sales (
  id                uuid        primary key default gen_random_uuid(),
  theme_id          uuid        not null references public.themes(id) on delete cascade,
  buyer_id          uuid        not null references auth.users(id) on delete cascade,
  seller_id         uuid        not null references auth.users(id),
  stripe_session_id text,
  amount            numeric(10,2) not null,
  platform_fee      numeric(10,2) not null,
  creator_earnings  numeric(10,2) not null,
  created_at        timestamptz   not null default now()
);

create index if not exists idx_theme_sales_theme_id  on public.theme_sales (theme_id);
create index if not exists idx_theme_sales_buyer_id  on public.theme_sales (buyer_id);
create index if not exists idx_theme_sales_seller_id on public.theme_sales (seller_id);

comment on table public.theme_sales is 'Revenue record for each paid custom theme unlock. 15% platform fee.';

-- ── 5. RLS ───────────────────────────────────────────────────────────────────

alter table public.theme_unlocks enable row level security;
alter table public.promo_codes   enable row level security;
alter table public.theme_sales   enable row level security;

-- theme_unlocks: users see only their own rows
create policy "theme_unlocks: select own"
  on public.theme_unlocks for select
  using (auth.uid() = user_id);

-- theme_sales: buyers see their own purchases; sellers see their earnings
create policy "theme_sales: select as buyer"
  on public.theme_sales for select
  using (auth.uid() = buyer_id);

create policy "theme_sales: select as seller"
  on public.theme_sales for select
  using (auth.uid() = seller_id);

-- promo_codes: read performed via service role in API only — no direct user select
-- (prevents scraping valid codes from the DB)
-- Admins can do everything via service role key, no policies needed.

-- ── 6. increment_theme_unlock RPC ────────────────────────────────────────────
-- Called by API routes after each unlock; runs as definer so it bypasses RLS.

create or replace function public.increment_theme_unlock(theme_id_input uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.themes
  set unlock_count = unlock_count + 1
  where id = theme_id_input;
$$;

-- Restrict to service-role callers only (API routes use service role key).
revoke execute on function public.increment_theme_unlock(uuid) from public, anon, authenticated;
