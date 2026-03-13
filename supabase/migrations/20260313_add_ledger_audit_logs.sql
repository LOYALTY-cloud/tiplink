-- Add ledger_audit_logs to record who/why/admin actions for ledger changes
create table if not exists ledger_audit_logs (
  id uuid primary key default gen_random_uuid(),

  -- Optional link to the ledger row that was changed
  ledger_id uuid references transactions_ledger(id) on delete set null,

  -- Which user the ledger row pertains to (if applicable)
  user_id uuid references profiles(id) on delete set null,

  -- Who performed the action (admin user id or system)
  performed_by uuid references profiles(id) on delete set null,

  -- High-level action (e.g. 'auto-reconcile', 'manual-correction', 'import')
  action text not null,

  -- Reason or notes provided by the actor
  reason text,

  -- Arbitrary JSON metadata (previous values, diff, external refs)
  metadata jsonb default '{}'::jsonb,

  created_at timestamptz default now()
);

create index if not exists idx_ledger_audit_ledger_id on ledger_audit_logs(ledger_id);
create index if not exists idx_ledger_audit_user_id on ledger_audit_logs(user_id);
