create table if not exists public.user_theme_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  theme_id uuid not null references public.themes(id) on delete cascade,
  creator_id uuid null references auth.users(id) on delete set null,
  action text not null check (action in ('view', 'preview', 'apply', 'purchase', 'favorite')),
  category_slug text null,
  animation_type text null,
  price numeric null,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_theme_activity_user_created
  on public.user_theme_activity (user_id, created_at desc);

create index if not exists idx_user_theme_activity_theme
  on public.user_theme_activity (theme_id, created_at desc);

comment on table public.user_theme_activity is 'Behavior stream used for theme personalization and discovery ranking.';