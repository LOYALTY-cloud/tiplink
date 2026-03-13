-- Add ledger logging to process_tip_succeeded
-- This migration replaces the existing function to also insert a transactions_ledger row

create or replace function public.process_tip_succeeded(
  p_stripe_payment_intent_id text,
  p_creator_user_id uuid,
  p_amount numeric,
  p_platform_fee numeric,
  p_net numeric,
  p_receipt_id text
)
returns void
language plpgsql
security definer
as $$
declare
  inserted_count int;
begin
  -- Upsert tip record (prevents duplicates if webhook retries)
  insert into public.tips (
    stripe_payment_intent_id,
    receiver_user_id,
    amount,
    platform_fee,
    net,
    receipt_id,
    status,
    created_at,
    updated_at
  ) values (
    p_stripe_payment_intent_id,
    p_creator_user_id,
    p_amount,
    p_platform_fee,
    p_net,
    p_receipt_id,
    'succeeded',
    now(),
    now()
  )
  on conflict (stripe_payment_intent_id) do update
  set status = 'succeeded',
      updated_at = now();

  -- Check if this was a new insert (not an update)
  get diagnostics inserted_count = row_count;

  -- Only credit wallet and log ledger if newly inserted (prevents duplicate credits on webhook retries)
  if inserted_count = 1 then
    -- Ensure wallet row exists
    perform public.ensure_wallet_row(p_creator_user_id);

    -- Credit PENDING balance (funds not yet available for withdrawal)
    update public.wallets
    set pending = pending + p_net,
        updated_at = now()
    where user_id = p_creator_user_id;

    -- Insert immutable ledger entry (credit to receiver)
    begin
      insert into public.transactions_ledger (
        user_id, type, amount, reference_id, created_at, metadata
      ) values (
        p_creator_user_id,
        'tip',
        p_net,
        null,
        now(),
        jsonb_build_object('stripe_payment_intent_id', p_stripe_payment_intent_id, 'receipt_id', p_receipt_id)
      );
    exception when others then
      -- If ledger insert fails for any reason, raise an error so the webhook processing surfaces problem
      raise;
    end;
  end if;
end;
$$;

revoke all on function public.process_tip_succeeded(text, uuid, numeric, numeric, numeric, text) from public;
grant execute on function public.process_tip_succeeded(text, uuid, numeric, numeric, numeric, text) to authenticated;
