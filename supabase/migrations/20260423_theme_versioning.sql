-- Immutable creator theme versioning.
-- Updating a marketplace theme creates a new row (new product version)
-- instead of overwriting existing purchased versions.

alter table public.themes
  add column if not exists version int not null default 1,
  add column if not exists parent_theme_id uuid references public.themes(id) on delete set null;

create index if not exists idx_themes_parent_theme_id
  on public.themes (parent_theme_id)
  where parent_theme_id is not null;

create index if not exists idx_themes_user_version
  on public.themes (user_id, version desc);

comment on column public.themes.version is 'Product version number. New updates create a new row with version+1.';
comment on column public.themes.parent_theme_id is 'Previous version theme id when this row is created as an update.';
