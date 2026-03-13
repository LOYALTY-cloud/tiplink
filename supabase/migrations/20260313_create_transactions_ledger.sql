-- Create immutable transactions_ledger table to record all money movements
create table if not exists transactions_ledger (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references profiles(id)
        on delete cascade,

    type text not null,
    amount numeric not null,
    reference_id uuid,

    created_at timestamptz default now(),
    metadata jsonb default '{}'::jsonb
);

create index if not exists idx_transactions_user_id on transactions_ledger(user_id);
create index if not exists idx_transactions_reference_id on transactions_ledger(reference_id);

-- Prevent accidental updates or deletes: ledger must be append-only
create or replace function transactions_ledger_prevent_update_delete()
returns trigger language plpgsql as $$
begin
    if tg_op = 'UPDATE' or tg_op = 'DELETE' then
        raise exception 'transactions_ledger is immutable: % operation not allowed', tg_op;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_transactions_immutable on transactions_ledger;
create trigger trg_transactions_immutable
    before update or delete on transactions_ledger
    for each row execute procedure transactions_ledger_prevent_update_delete();
