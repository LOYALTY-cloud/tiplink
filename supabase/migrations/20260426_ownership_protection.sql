-- True ownership protection:
-- Creators can never hard-delete a theme that has been purchased.
-- Soft-delete sets is_deleted=true and propagates is_deleted_source to buyer records.
-- theme_version snapshots which version was purchased for display purposes.

-- 1. Soft-delete flag on themes (replaces hard DELETE)
alter table public.themes
  add column if not exists is_deleted boolean not null default false;

create index if not exists idx_themes_is_deleted
  on public.themes (is_deleted)
  where is_deleted = true;

comment on column public.themes.is_deleted is 'Soft-delete. Never set to false after true — use is_market_active/is_public to unlist without deleting.';

-- 2. Propagation flag on theme_unlocks: true when the source theme was soft-deleted by creator
alter table public.theme_unlocks
  add column if not exists is_deleted_source boolean not null default false;

comment on column public.theme_unlocks.is_deleted_source is 'True when the creator has deleted the original theme listing. Ownership (theme_config snapshot) remains valid.';

-- 3. Version snapshot: freeze which version number was purchased
alter table public.theme_unlocks
  add column if not exists theme_version int;

comment on column public.theme_unlocks.theme_version is 'Version of the theme at unlock time (from themes.version).';
