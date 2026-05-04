-- Rename creator tier value from 'partner' to 'elite'
-- Keeps backward compatibility by converting stored values before enforcing check.

update public.profiles
set creator_tier = 'elite'
where creator_tier = 'partner';

do $$
declare
  c record;
begin
  -- Drop existing creator_tier check constraints (name may differ by environment).
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'profiles'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%creator_tier%'
  loop
    execute format('alter table public.profiles drop constraint if exists %I', c.conname);
  end loop;
end
$$;

alter table public.profiles
  add constraint profiles_creator_tier_check
  check (creator_tier in ('basic', 'pro', 'elite'));

comment on column public.profiles.creator_tier is 'null = not a creator | basic | pro | elite';
