-- Enforce hard scarcity for elite creator approvals.
-- Max approved creators allowed at any time.

create or replace function public.limit_elite_creators()
returns trigger
language plpgsql
as $$
declare
  approved_count integer;
begin
  -- Only enforce when transitioning into approved.
  if NEW.status = 'approved' and (OLD.status is distinct from 'approved') then
    -- Transaction-level lock avoids race conditions on concurrent approvals.
    perform pg_advisory_xact_lock(hashtext('elite_creator_approval_limit'));

    select count(*) into approved_count
    from public.elite_creator_applications
    where status = 'approved';

    if approved_count >= 10 then
      raise exception 'Elite Creator limit reached';
    end if;
  end if;

  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists check_elite_limit on public.elite_creator_applications;

create trigger check_elite_limit
before update on public.elite_creator_applications
for each row
execute function public.limit_elite_creators();

-- Optional strict mode: stop accepting brand-new applications after capacity is full.
create or replace function public.block_new_elite_applications()
returns trigger
language plpgsql
as $$
declare
  approved_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('elite_creator_insert_limit'));

  select count(*) into approved_count
  from public.elite_creator_applications
  where status = 'approved';

  if approved_count >= 10 then
    raise exception 'Applications are closed';
  end if;

  NEW.updated_at := coalesce(NEW.updated_at, now());
  return NEW;
end;
$$;

drop trigger if exists block_application_insert on public.elite_creator_applications;

create trigger block_application_insert
before insert on public.elite_creator_applications
for each row
execute function public.block_new_elite_applications();
