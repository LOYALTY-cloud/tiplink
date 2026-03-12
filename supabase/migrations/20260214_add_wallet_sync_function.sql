-- Function to sync wallet balances from Stripe balance API

create or replace function public.sync_wallet_from_stripe_balance(
  p_user_id uuid,
  p_available numeric,
  p_pending numeric
)
returns void
language plpgsql
security definer
as $$
begin
  perform public.ensure_wallet_row(p_user_id);

  update public.wallets
  set available = greatest(p_available, 0),
      pending   = greatest(p_pending, 0),
      updated_at = now()
  where user_id = p_user_id;
end;
$$;

revoke all on function public.sync_wallet_from_stripe_balance(uuid, numeric, numeric) from public;
grant execute on function public.sync_wallet_from_stripe_balance(uuid, numeric, numeric) to authenticated;
