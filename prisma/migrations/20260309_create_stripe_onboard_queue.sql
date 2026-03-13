-- migrations/20260309_create_stripe_onboard_queue.sql
create table if not exists stripe_onboard_queue (
    id serial primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    status text not null default 'pending',
    retry_count int not null default 0,
    last_attempt timestamptz,
    error_text text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create index if not exists idx_stripe_onboard_queue_status on stripe_onboard_queue(status);
