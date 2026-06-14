-- Admin weekly schedule assignments
-- Owners set shift times per day; admins see their own schedule on /admin/workschedule

create table public.admin_schedules (
  id                uuid        primary key default gen_random_uuid(),
  admin_id          uuid        not null references profiles(user_id) on delete cascade,

  monday_start      time,
  monday_end        time,
  monday_off        boolean     not null default false,

  tuesday_start     time,
  tuesday_end       time,
  tuesday_off       boolean     not null default false,

  wednesday_start   time,
  wednesday_end     time,
  wednesday_off     boolean     not null default false,

  thursday_start    time,
  thursday_end      time,
  thursday_off      boolean     not null default false,

  friday_start      time,
  friday_end        time,
  friday_off        boolean     not null default false,

  saturday_start    time,
  saturday_end      time,
  saturday_off      boolean     not null default false,

  sunday_start      time,
  sunday_end        time,
  sunday_off        boolean     not null default false,

  updated_at        timestamptz not null default now(),
  updated_by        uuid        references profiles(user_id)
);

create unique index idx_admin_schedules_admin_id on public.admin_schedules (admin_id);

-- RLS: service role only (API layer enforces access control)
alter table public.admin_schedules enable row level security;

create policy "no client access"
  on public.admin_schedules
  for all
  using (false);
