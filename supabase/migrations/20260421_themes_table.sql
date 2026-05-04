-- Creator Themes — stores saved theme configurations per user.
--
-- config jsonb: the full ThemeConfig object:
--   { primaryColor, accentColor, textColor, background, animation }
--
-- background in config is a permanent Supabase Storage public URL
-- (blob: URLs from the builder are uploaded before saving).

create table if not exists public.themes (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  name        text        not null default 'My Theme',
  config      jsonb       not null default '{}',
  is_active   boolean     not null default false,
  created_at  timestamptz not null default now()
);

-- Index for fast per-user lookup
create index if not exists idx_themes_user_id
  on public.themes (user_id, created_at desc);

-- Index for the active theme lookup
create index if not exists idx_themes_active
  on public.themes (user_id, is_active)
  where is_active = true;

-- RLS
alter table public.themes enable row level security;

create policy "themes: users can insert own"
  on public.themes for insert
  with check (auth.uid() = user_id);

create policy "themes: users can select own"
  on public.themes for select
  using (auth.uid() = user_id);

create policy "themes: users can update own"
  on public.themes for update
  using (auth.uid() = user_id);

create policy "themes: users can delete own"
  on public.themes for delete
  using (auth.uid() = user_id);

comment on table public.themes is 'Creator theme configurations saved from the theme builder.';
comment on column public.themes.config       is 'Full ThemeConfig JSON: primaryColor, accentColor, textColor, background (storage URL), animation.';
comment on column public.themes.is_active    is 'True when this is the theme currently applied to the creator page.';
