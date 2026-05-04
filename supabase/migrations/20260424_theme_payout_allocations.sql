-- Deterministic theme payout allocations
-- Reserve exact approved sale chunks at request time so later processing cannot fail
-- from allocation mismatch.

create table if not exists public.theme_payout_allocations (
  id uuid primary key default gen_random_uuid(),
  payout_request_id uuid not null references public.payout_requests(id) on delete cascade,
  theme_sale_id uuid not null references public.theme_sales(id) on delete cascade,
  amount_allocated numeric(10,2) not null check (amount_allocated > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_theme_payout_allocations_payout
  on public.theme_payout_allocations (payout_request_id);

create index if not exists idx_theme_payout_allocations_sale
  on public.theme_payout_allocations (theme_sale_id);

create unique index if not exists idx_theme_payout_allocations_unique_pair
  on public.theme_payout_allocations (payout_request_id, theme_sale_id);

alter table public.theme_sales
  add column if not exists reserved_amount numeric(10,2) not null default 0,
  add column if not exists paid_out_amount numeric(10,2) not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'theme_sales_reserved_not_negative'
  ) then
    alter table public.theme_sales
      add constraint theme_sales_reserved_not_negative
      check (reserved_amount >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'theme_sales_reserved_not_over_earnings'
  ) then
    alter table public.theme_sales
      add constraint theme_sales_reserved_not_over_earnings
      check (reserved_amount <= creator_earnings);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'theme_sales_paid_out_not_negative'
  ) then
    alter table public.theme_sales
      add constraint theme_sales_paid_out_not_negative
      check (paid_out_amount >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'theme_sales_paid_out_not_over_earnings'
  ) then
    alter table public.theme_sales
      add constraint theme_sales_paid_out_not_over_earnings
      check (paid_out_amount <= creator_earnings);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'theme_sales_reserved_not_over_remaining'
  ) then
    alter table public.theme_sales
      add constraint theme_sales_reserved_not_over_remaining
      check (reserved_amount <= (creator_earnings - paid_out_amount));
  end if;
end $$;

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
