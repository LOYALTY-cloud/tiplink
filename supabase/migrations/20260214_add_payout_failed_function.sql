-- Function to mark payout as failed or canceled (no wallet changes)

create or replace function public.process_payout_failed_or_canceled(
  p_withdrawal_id uuid,
  p_user_id uuid,
  p_status text,              -- 'failed' or 'canceled'
  p_stripe_payout_id text
)
returns void
language plpgsql
security definer
as $$
begin
  update public.withdrawals
  set status = p_status,
      stripe_payout_id = coalesce(stripe_payout_id, p_stripe_payout_id),
      updated_at = now()
  where id = p_withdrawal_id
    and user_id = p_user_id;
end;
$$;

revoke all on function public.process_payout_failed_or_canceled(uuid, uuid, text, text) from public;
grant execute on function public.process_payout_failed_or_canceled(uuid, uuid, text, text) to authenticated;
