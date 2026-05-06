-- Theme Marketplace Protection System
-- Adds: creator_marketplace_profiles, creator_legal_acceptance, theme_reports,
--       creator_strikes, dmca_claims, and protection columns on themes.

-- ── 1. Extend themes table ────────────────────────────────────────────────────

alter table public.themes
  add column if not exists status             text    not null default 'draft'
    check (status in ('draft','pending_review','approved','flagged','removed','banned_creator')),
  add column if not exists risk_score         integer not null default 0,
  add column if not exists moderation_reason  text,
  add column if not exists duplicate_warning  boolean not null default false,
  add column if not exists theme_hash         text,
  add column if not exists asset_hash         text,
  add column if not exists image_hash         text,
  add column if not exists sales_count        integer not null default 0,
  add column if not exists revenue_earned     numeric(10,2) not null default 0,
  add column if not exists preview_images     text[],
  add column if not exists theme_file_url     text,
  add column if not exists tags               text[];

create index if not exists idx_themes_status      on public.themes (status);
create index if not exists idx_themes_theme_hash  on public.themes (theme_hash) where theme_hash is not null;
create index if not exists idx_themes_risk_score  on public.themes (risk_score desc);

-- ── 2. creator_marketplace_profiles ──────────────────────────────────────────

create table if not exists public.creator_marketplace_profiles (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        unique not null references auth.users(id) on delete cascade,
  trust_score       integer     not null default 100,
  total_sales       integer     not null default 0,
  total_reports     integer     not null default 0,
  refund_rate       numeric(5,4) not null default 0,
  chargebacks       integer     not null default 0,
  active_strikes    integer     not null default 0,
  creator_badge     text        not null default 'bronze'
    check (creator_badge in ('bronze','silver','white','blue','gold')),
  verified_identity boolean     not null default false,
  payouts_enabled   boolean     not null default false,
  upload_ban_until  timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists idx_creator_mp_user_id on public.creator_marketplace_profiles (user_id);

alter table public.creator_marketplace_profiles enable row level security;

create policy "creator_marketplace_profiles: owner select"
  on public.creator_marketplace_profiles for select
  using (auth.uid() = user_id);

create policy "creator_marketplace_profiles: service role all"
  on public.creator_marketplace_profiles
  using (true)
  with check (true);

comment on table public.creator_marketplace_profiles is 'Reputation and trust data for creators selling themes in the marketplace.';

-- ── 3. creator_legal_acceptance ──────────────────────────────────────────────

create table if not exists public.creator_legal_acceptance (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  policy_version  text        not null,
  accepted_at     timestamptz not null default now(),
  ip_address      text,
  app_version     text
);

create unique index if not exists uniq_creator_legal_user_version
  on public.creator_legal_acceptance (user_id, policy_version);

create index if not exists idx_creator_legal_user_id
  on public.creator_legal_acceptance (user_id);

alter table public.creator_legal_acceptance enable row level security;

create policy "creator_legal_acceptance: owner select"
  on public.creator_legal_acceptance for select
  using (auth.uid() = user_id);

create policy "creator_legal_acceptance: owner insert"
  on public.creator_legal_acceptance for insert
  with check (auth.uid() = user_id);

comment on table public.creator_legal_acceptance is 'Audit log of creator marketplace policy agreements per policy version.';

-- ── 4. theme_reports ─────────────────────────────────────────────────────────

create table if not exists public.theme_reports (
  id          uuid        primary key default gen_random_uuid(),
  theme_id    uuid        not null references public.themes(id) on delete cascade,
  reporter_id uuid        references auth.users(id) on delete set null,
  reason      text        not null,
  details     text,
  status      text        not null default 'pending'
    check (status in ('pending','reviewed','dismissed','action_taken')),
  created_at  timestamptz not null default now()
);

create index if not exists idx_theme_reports_theme_id  on public.theme_reports (theme_id);
create index if not exists idx_theme_reports_status    on public.theme_reports (status);

alter table public.theme_reports enable row level security;

create policy "theme_reports: insert authenticated"
  on public.theme_reports for insert
  with check (auth.uid() = reporter_id or reporter_id is null);

comment on table public.theme_reports is 'User-submitted reports against marketplace themes.';

-- ── 5. creator_strikes ───────────────────────────────────────────────────────

create table if not exists public.creator_strikes (
  id          uuid        primary key default gen_random_uuid(),
  creator_id  uuid        not null references auth.users(id) on delete cascade,
  theme_id    uuid        references public.themes(id) on delete set null,
  reason      text,
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_creator_strikes_creator_id on public.creator_strikes (creator_id);

alter table public.creator_strikes enable row level security;

create policy "creator_strikes: service role all"
  on public.creator_strikes
  using (true)
  with check (true);

comment on table public.creator_strikes is 'Strike records issued to creators for policy violations.';

-- ── 6. dmca_claims ───────────────────────────────────────────────────────────

create table if not exists public.dmca_claims (
  id               uuid        primary key default gen_random_uuid(),
  theme_id         uuid        references public.themes(id) on delete cascade,
  claimant_name    text        not null,
  email            text        not null,
  company          text,
  copyright_proof  text,
  description      text        not null,
  signature        text        not null,
  status           text        not null default 'pending'
    check (status in ('pending','under_review','upheld','dismissed')),
  created_at       timestamptz not null default now()
);

create index if not exists idx_dmca_claims_theme_id on public.dmca_claims (theme_id);
create index if not exists idx_dmca_claims_status   on public.dmca_claims (status);

alter table public.dmca_claims enable row level security;

-- Public can insert DMCA claims (unauthenticated reporters)
create policy "dmca_claims: public insert"
  on public.dmca_claims for insert
  with check (true);

comment on table public.dmca_claims is 'DMCA takedown requests submitted by IP owners against themes.';
