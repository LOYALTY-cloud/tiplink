-- ============================================================
-- Admin Internal Control & Discipline System
-- Tables: admins (identity), admin_tickets (discipline + comms)
-- Hierarchy: owner > super_admin > admin
-- ============================================================

-- 1. admins — core admin identity table
create table if not exists admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles(user_id) on delete cascade,
  full_name text,
  role text not null default 'admin' check (role in ('admin', 'owner')),
  status text not null default 'active' check (status in ('active', 'restricted', 'suspended', 'terminated')),
  restricted_until timestamptz,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create index if not exists idx_admins_status on admins (status);
create index if not exists idx_admins_role on admins (role);

-- 2. admin_tickets — discipline & internal communication
--    Hierarchy-enforced: owner→anyone, super_admin→admin, admin→nobody
create table if not exists admin_tickets (
  id uuid primary key default gen_random_uuid(),
  from_admin_id uuid not null references admins(id) on delete set null,
  to_admin_id uuid not null references admins(id) on delete set null,
  from_role text not null,
  to_role text not null,
  type text not null check (type in ('warning', 'performance_review', 'policy_violation', 'escalation', 'note')),
  message text not null,
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  auto_generated boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_tickets_to on admin_tickets (to_admin_id, status);
create index if not exists idx_admin_tickets_from on admin_tickets (from_admin_id);
create index if not exists idx_admin_tickets_status on admin_tickets (status, created_at desc);
create index if not exists idx_admin_tickets_type on admin_tickets (type);

-- 3. Ensure admin_actions has reason column
alter table admin_actions add column if not exists reason text;

-- 4. RLS
alter table admins enable row level security;
alter table admins force row level security;
alter table admin_tickets enable row level security;
alter table admin_tickets force row level security;

-- Admins table: service role only (all access via API)
create policy "admins_service_only" on admins for all using (false);

-- Admin tickets: service role only
create policy "admin_tickets_service_only" on admin_tickets for all using (false);
