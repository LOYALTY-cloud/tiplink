-- RPC to compute total card spend for the current week for a user
create or replace function public.get_weekly_card_spend(p_user_id uuid)
returns numeric
language sql
as $$
  select coalesce(sum(amount),0)
  from transactions_ledger
  where user_id = p_user_id
    and type = 'card_charge'
    and created_at >= date_trunc('week', now());
$$;
