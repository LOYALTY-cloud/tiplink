-- Central admin audit timeline (calendar entry point + day drilldown source).

create table if not exists public.admin_activity_log (
  id uuid primary key default gen_random_uuid(),

  -- New audit timeline model
  type text not null default 'system',
  title text,
  description text,
  related_id uuid,

  -- Existing fields used by current writers (kept for compatibility)
  actor text,
  action text,
  label text,
  severity text,
  target_user uuid,
  target_handle text,
  target_display_name text,

  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- If the table already exists from prior manual setup, ensure required columns exist.
alter table public.admin_activity_log
  add column if not exists type text not null default 'system',
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists related_id uuid,
  add column if not exists actor text,
  add column if not exists action text,
  add column if not exists label text,
  add column if not exists severity text,
  add column if not exists target_user uuid,
  add column if not exists target_handle text,
  add column if not exists target_display_name text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now();

create index if not exists idx_admin_activity_log_created_at
  on public.admin_activity_log (created_at desc);

create index if not exists idx_admin_activity_log_type_created
  on public.admin_activity_log (type, created_at desc);

create index if not exists idx_admin_activity_log_related
  on public.admin_activity_log (related_id);

alter table public.admin_activity_log enable row level security;
