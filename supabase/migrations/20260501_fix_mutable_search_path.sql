-- Fix: mutable search_path on trigger functions.
-- Setting search_path = '' forces all object references to be schema-qualified,
-- preventing search_path injection attacks.

create or replace function public.limit_elite_creators()
returns trigger
language plpgsql
set search_path = ''
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

create or replace function public.block_new_elite_applications()
returns trigger
language plpgsql
set search_path = ''
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

-- Fix: mutable search_path on move_archived_admin_overrides_to_archive
create or replace function public.move_archived_admin_overrides_to_archive(
  retention_days integer default 60,
  batch_size integer default 5000
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  moved_count integer;
begin
  with candidates as (
    select id
    from public.admin_overrides
    where is_archived = true
      and created_at < now() - make_interval(days => retention_days)
    order by created_at asc
    limit batch_size
  ),
  moved_rows as (
    insert into public.admin_overrides_archive (
      id, admin_id, target_user, override_type,
      previous_value, new_value, reason, created_at, is_archived
    )
    select
      src.id, src.admin_id, src.target_user, src.override_type,
      src.previous_value, src.new_value, src.reason, src.created_at, true
    from public.admin_overrides src
    inner join candidates c on c.id = src.id
    on conflict (id) do nothing
    returning id
  ),
  deleted as (
    delete from public.admin_overrides active
    using candidates
    where active.id = candidates.id
    returning active.id
  )
  select count(*) into moved_count from deleted;
  return moved_count;
end;
$$;

-- Fix: mutable search_path on increment_reserved_amount
create or replace function public.increment_reserved_amount(
  sale_id uuid,
  amount numeric
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  current_reserved numeric;
  current_earnings numeric;
  current_paid_out numeric;
  next_reserved numeric;
begin
  select reserved_amount, creator_earnings, paid_out_amount
    into current_reserved, current_earnings, current_paid_out
  from public.theme_sales
  where id = sale_id
  for update;

  if current_reserved is null then
    raise exception 'theme_sale % not found', sale_id;
  end if;

  next_reserved := current_reserved + amount;

  if next_reserved < 0 then
    raise exception 'reserved_amount would go negative for sale %', sale_id;
  end if;

  if next_reserved > (current_earnings - coalesce(current_paid_out, 0)) then
    raise exception 'reserved_amount would exceed remaining allocatable earnings for sale %', sale_id;
  end if;

  update public.theme_sales
  set reserved_amount = next_reserved
  where id = sale_id;
end;
$$;

-- Fix: mutable search_path on settle_theme_sale_allocation
create or replace function public.settle_theme_sale_allocation(
  p_sale_id uuid,
  p_amount numeric,
  p_paid_at timestamptz
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_reserved numeric;
  v_paid_out numeric;
  v_total numeric;
begin
  select reserved_amount, paid_out_amount, creator_earnings
    into v_reserved, v_paid_out, v_total
  from public.theme_sales
  where id = p_sale_id
  for update;

  if v_reserved is null then
    raise exception 'theme_sale % not found', p_sale_id;
  end if;

  if p_amount <= 0 then
    raise exception 'settlement amount must be positive for sale %', p_sale_id;
  end if;

  if v_reserved < p_amount then
    raise exception 'reserved_amount too low for settlement on sale %', p_sale_id;
  end if;

  if (v_paid_out + p_amount) > v_total then
    raise exception 'paid_out_amount would exceed creator_earnings on sale %', p_sale_id;
  end if;

  update public.theme_sales
  set
    reserved_amount = reserved_amount - p_amount,
    paid_out_amount = paid_out_amount + p_amount,
    status = case
      when (paid_out_amount + p_amount) >= creator_earnings then 'paid'
      else status
    end,
    paid_at = case
      when (paid_out_amount + p_amount) >= creator_earnings then p_paid_at
      else paid_at
    end
  where id = p_sale_id;
end;
$$;
