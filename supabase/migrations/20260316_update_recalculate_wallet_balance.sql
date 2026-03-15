-- Update recalculate_wallet_balance to enforce 7-day pending delay for tip_received
create or replace function public.recalculate_wallet_balance(p_user_id uuid)
returns void
language plpgsql
as $$
begin
  update public.wallets
  set balance = (
    select coalesce(sum(amount),0)
    from public.transactions_ledger
    where transactions_ledger.user_id = p_user_id
  ),
  available = (
    select coalesce(sum(
      case
        when type = 'tip_received' then
          case when created_at <= now() - interval '7 days' then amount else 0 end
        else amount
      end
    ),0)
    from public.transactions_ledger
    where transactions_ledger.user_id = p_user_id
  )
  where wallets.user_id = p_user_id;

  -- If wallet row doesn't exist, create it with computed balances
  insert into public.wallets(user_id, balance, available, currency)
  select p_user_id,
    coalesce(sum(amount),0),
    coalesce(sum(
      case
        when type = 'tip_received' then
          case when created_at <= now() - interval '7 days' then amount else 0 end
        else amount
      end
    ),0),
    'usd'
  from public.transactions_ledger
  where transactions_ledger.user_id = p_user_id
  on conflict (user_id) do nothing;
end;
$$;
