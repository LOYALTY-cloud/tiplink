-- AI Action Reversibility — add rollback support to admin_activity_log.
--
-- Rules:
--   reversible     → this entry can be undone via /api/admin/ai/rollback
--   rollback_data  → JSON snapshot of before-state needed to restore
--   rolled_back    → true once the reversal has been applied
--   rolled_back_at → when the rollback was executed
--   rolled_back_by → admin UUID who triggered the rollback
--
-- NOT every action is reversible. Examples of safe candidates:
--   ✅ status changes, flags, internal state resets
-- Never mark reversible=true for:
--   ❌ Stripe payouts already sent, emails already sent, external calls

alter table public.admin_activity_log
  add column if not exists reversible       boolean     not null default false,
  add column if not exists rollback_data    jsonb,
  add column if not exists rolled_back      boolean     not null default false,
  add column if not exists rolled_back_at   timestamptz,
  add column if not exists rolled_back_by   uuid;

-- Fast lookups: find all reversible, not-yet-rolled-back entries
create index if not exists idx_admin_activity_log_reversible
  on public.admin_activity_log (reversible, rolled_back, created_at desc)
  where reversible = true;

comment on column public.admin_activity_log.reversible    is 'True when this action can be undone via the rollback API.';
comment on column public.admin_activity_log.rollback_data is 'Before-state snapshot required to restore the affected rows.';
comment on column public.admin_activity_log.rolled_back   is 'True once the rollback has been successfully applied.';
comment on column public.admin_activity_log.rolled_back_at is 'Timestamp when the rollback was executed.';
comment on column public.admin_activity_log.rolled_back_by is 'Admin UUID who confirmed and triggered the rollback.';
