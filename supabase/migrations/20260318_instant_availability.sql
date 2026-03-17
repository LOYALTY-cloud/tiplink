-- Remove 7-day pending delay: all funds instantly available
-- 1. Simplify recalculate_wallet_balance — balance = available (no pending split)
create or replace function public.recalculate_wallet_balance(p_user_id uuid)
returns void
language plpgsql
as $$
declare
  v_total numeric;
begin
  select coalesce(sum(amount), 0)
    into v_total
    from public.transactions_ledger
   where user_id = p_user_id;

  update public.wallets
     set balance   = v_total,
         available  = v_total,
         pending    = 0
   where user_id = p_user_id;

  -- Create wallet row if it doesn't exist
  insert into public.wallets(user_id, balance, available, pending)
  values (p_user_id, v_total, v_total, 0)
  on conflict (user_id) do nothing;
end;
$$;

-- 2. Flush any existing pending amounts into available
update public.wallets
   set available = balance,
       pending   = 0
 where pending <> 0;
