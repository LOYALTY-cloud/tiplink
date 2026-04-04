-- =============================================
-- ADMIN AVAILABILITY + AUTO-ASSIGNMENT SUPPORT
-- Run in Supabase SQL Editor. Safe to re-run.
-- =============================================

-- availability column on profiles: online | busy | offline
alter table profiles
  add column if not exists availability text default 'offline';

create index if not exists idx_profiles_availability
on profiles (role, availability)
where role in ('owner', 'super_admin', 'finance_admin', 'support_admin');

-- session mode: human | ai (AI-first with human fallback)
alter table support_sessions
  add column if not exists mode text default 'human';

create index if not exists idx_support_sessions_mode
on support_sessions (mode, status);

-- Escalation columns on support_sessions
alter table support_sessions
  add column if not exists escalation boolean default false;

alter table support_sessions
  add column if not exists escalation_reason text;

alter table support_sessions
  add column if not exists escalated_at timestamptz;

create index if not exists idx_support_sessions_escalation
on support_sessions (escalation, status)
where escalation = true;

-- Function: mark stale admins offline (no heartbeat in 5 min)
-- Call via pg_cron or Supabase Edge Function on a schedule
create or replace function mark_stale_admins_offline()
returns void as $$
begin
  update profiles
  set availability = 'offline'
  where availability in ('online', 'busy')
    and role in ('owner', 'super_admin', 'finance_admin', 'support_admin')
    and (last_active_at is null or last_active_at < now() - interval '5 minutes');
end;
$$ language plpgsql;
