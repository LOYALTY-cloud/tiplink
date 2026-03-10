-- Create admin logs table for Stripe onboarding actions
create table if not exists stripe_onboard_admin_logs (
    id uuid primary key default gen_random_uuid(),

    -- Admin who performed the action
    admin_id uuid
        references profiles(id)
        on delete set null,

    -- Target user affected
    user_id uuid not null
        references profiles(id)
        on delete cascade,

    -- Action performed
    action text not null,

    -- Optional metadata
    metadata jsonb,

    -- Timestamp
    created_at timestamptz default now()
);

-- Helpful indexes
create index if not exists idx_admin_logs_admin_id
on stripe_onboard_admin_logs(admin_id);

create index if not exists idx_admin_logs_user_id
on stripe_onboard_admin_logs(user_id);

create index if not exists idx_admin_logs_created_at
on stripe_onboard_admin_logs(created_at desc);

-- Example row (what this logs):
-- admin_id | user_id | action      | created_at
-- ---------+---------+-------------+------------
-- admin123 | user456 | force_retry | 2026-03-10

-- Example metadata JSON:
-- {
--   "previous_status": "failed",
--   "retry_count": 3
-- }

-- Example insert (from server/admin route):
-- await supabaseAdmin
--   .from("stripe_onboard_admin_logs")
--   .insert({
--     admin_id,
--     user_id,
--     action: "force_retry",
--     metadata: { triggered_from: "admin_panel" }
--   });

-- Safe local run (backup + migration):
-- Replace DATABASE_URL and migration file as needed
-- pg_dump "$DATABASE_URL" | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz && \
-- psql "$DATABASE_URL" -f migrations/20260310_create_stripe_onboard_admin_logs.sql && \
-- psql "$DATABASE_URL" -c "SELECT * FROM stripe_onboard_admin_logs LIMIT 1;"
