-- Replace insert_ledger_entry_with_audit to call recalculate_wallet_balance
create or replace function public.insert_ledger_entry_with_audit(
  _user_id uuid,
  _type text,
  _amount numeric,
  _reference_id uuid default null,
  _metadata jsonb default '{}'::jsonb,
  _performed_by uuid default null,
  _action text default 'insert',
  _reason text default null
)
returns table(
  id uuid,
  user_id uuid,
  type text,
  amount numeric,
  reference_id uuid,
  metadata jsonb,
  created_at timestamptz
)
language plpgsql
security definer
as $$
declare
  rec public.transactions_ledger%rowtype;
begin
  insert into public.transactions_ledger (user_id, type, amount, reference_id, metadata)
  values (_user_id, _type, _amount, _reference_id, _metadata)
  returning * into rec;

  insert into public.ledger_audit_logs (ledger_id, user_id, performed_by, action, reason, metadata)
  values (rec.id, rec.user_id, _performed_by, _action, _reason, _metadata);

  -- Recalculate wallet balance for the affected user
  perform public.recalculate_wallet_balance(rec.user_id);

  return query select rec.id, rec.user_id, rec.type, rec.amount, rec.reference_id, rec.metadata, rec.created_at;
end;
$$;
