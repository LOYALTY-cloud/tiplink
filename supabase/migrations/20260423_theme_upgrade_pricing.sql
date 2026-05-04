-- Upgrade pricing for versioned marketplace themes.

alter table public.themes
  add column if not exists base_price numeric(10,2),
  add column if not exists upgrade_price numeric(10,2);

comment on column public.themes.base_price is 'Full price for new buyers.';
comment on column public.themes.upgrade_price is 'Discounted price for owners of previous versions.';

-- Keep backward compatibility with existing price column.
update public.themes
set base_price = price
where base_price is null and price is not null;

update public.themes
set price = base_price
where price is null and base_price is not null;

-- Optional lineage hint on unlock rows for simplified analytics/pricing checks.
alter table public.theme_unlocks
  add column if not exists parent_theme_id uuid references public.themes(id) on delete set null;

create index if not exists idx_theme_unlocks_parent_theme_id
  on public.theme_unlocks (parent_theme_id)
  where parent_theme_id is not null;

update public.theme_unlocks tu
set parent_theme_id = t.parent_theme_id
from public.themes t
where tu.theme_id = t.id
  and tu.parent_theme_id is null;
