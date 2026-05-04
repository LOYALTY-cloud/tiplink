-- Durable ownership snapshots for custom marketplace themes.
-- Keeps user ownership usable even if creator deletes or unlists the source theme.

alter table public.theme_unlocks
  add column if not exists creator_id uuid references auth.users(id) on delete set null,
  add column if not exists theme_name text,
  add column if not exists theme_config jsonb,
  add column if not exists unlocked_via text;

-- Keep compatibility with prior schema values.
update public.theme_unlocks
set unlocked_via = coalesce(unlocked_via, source)
where unlocked_via is null;

alter table public.theme_unlocks
  alter column theme_id drop not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'theme_unlocks_theme_id_fkey'
      and conrelid = 'public.theme_unlocks'::regclass
  ) then
    alter table public.theme_unlocks
      drop constraint theme_unlocks_theme_id_fkey;
  end if;
end $$;

alter table public.theme_unlocks
  add constraint theme_unlocks_theme_id_fkey
  foreign key (theme_id)
  references public.themes(id)
  on delete set null;

alter table public.theme_unlocks
  drop constraint if exists theme_unlocks_unlocked_via_check;

alter table public.theme_unlocks
  add constraint theme_unlocks_unlocked_via_check
  check (unlocked_via in ('promo', 'payment'));

-- Backfill snapshot data from currently existing themes where available.
update public.theme_unlocks tu
set
  creator_id = coalesce(tu.creator_id, t.user_id),
  theme_name = coalesce(tu.theme_name, t.name),
  theme_config = coalesce(tu.theme_config, t.config)
from public.themes t
where tu.theme_id = t.id;

create index if not exists idx_theme_unlocks_creator_id
  on public.theme_unlocks (creator_id)
  where creator_id is not null;

comment on column public.theme_unlocks.theme_name is 'Snapshot of theme name at unlock time.';
comment on column public.theme_unlocks.theme_config is 'Snapshot of theme config JSON at unlock time (durable ownership).';
comment on column public.theme_unlocks.unlocked_via is 'promo or payment';
comment on column public.theme_unlocks.creator_id is 'Creator user id at unlock time (nullable for legacy rows).';
