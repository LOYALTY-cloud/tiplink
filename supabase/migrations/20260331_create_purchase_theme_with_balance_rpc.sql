-- Atomic RPC: purchase a theme (or bundle) using wallet balance.
-- Runs in a single transaction — no race conditions.
create or replace function public.purchase_theme_with_balance(
  p_user_id uuid,
  p_theme text,
  p_price_dollars numeric
)
returns jsonb
language plpgsql
as $$
declare
  v_balance numeric;
  v_exists boolean;
  v_has_bundle boolean;
begin
  -- 1. Lock wallet row (SELECT … FOR UPDATE prevents concurrent purchases)
  select balance into v_balance
  from public.wallets
  where user_id = p_user_id
  for update;

  if v_balance is null then
    return jsonb_build_object('error', 'wallet_not_found');
  end if;

  -- 2. Check if user already owns "all" bundle
  select exists(
    select 1 from public.theme_purchases
    where user_id = p_user_id and theme = 'all'
  ) into v_has_bundle;

  if v_has_bundle and p_theme <> 'all' then
    return jsonb_build_object('error', 'already_purchased');
  end if;

  -- 3. Check if exact theme already purchased
  select exists(
    select 1 from public.theme_purchases
    where user_id = p_user_id and theme = p_theme
  ) into v_exists;

  if v_exists then
    return jsonb_build_object('error', 'already_purchased');
  end if;

  -- 4. Check sufficient balance
  if v_balance < p_price_dollars then
    return jsonb_build_object(
      'error', 'insufficient_balance',
      'balance', v_balance,
      'required', p_price_dollars
    );
  end if;

  -- 5. Insert ledger entry (append-only, negative = debit)
  insert into public.transactions_ledger (
    user_id, type, amount, meta, status, created_at
  ) values (
    p_user_id,
    'theme_purchase',
    -p_price_dollars,
    jsonb_build_object(
      'theme', p_theme,
      'price_dollars', p_price_dollars,
      'payment_method', 'wallet_balance'
    ),
    'completed',
    now()
  );

  -- 6. Recalculate wallet balance from ledger (single source of truth)
  perform public.recalculate_wallet_balance(p_user_id);

  -- 7. Record theme purchase
  insert into public.theme_purchases (user_id, theme, amount)
  values (p_user_id, p_theme, (p_price_dollars * 100)::integer);

  return jsonb_build_object('success', true, 'theme', p_theme);
end;
$$;
