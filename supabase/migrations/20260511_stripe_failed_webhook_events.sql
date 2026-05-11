-- Failed Stripe webhook queue for internal replay/monitoring.
-- Keeps durable records when webhook processing is acknowledged but not completed.

create table if not exists stripe_failed_webhook_events (
  event_id text primary key,
  event_type text not null,
  stripe_account_id text,
  stripe_object_id text,
  affected_user_id uuid,
  payload jsonb not null,
  status text not null default 'failed' check (status in ('failed', 'replay_failed', 'replayed_success')),
  failure_count integer not null default 1,
  retry_count integer not null default 0,
  first_failed_at timestamptz not null default now(),
  last_failed_at timestamptz not null default now(),
  last_error_message text,
  last_replayed_at timestamptz,
  last_replayed_by_admin_id uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_failed_webhooks_status_last_failed
  on stripe_failed_webhook_events (status, last_failed_at desc);

create index if not exists idx_failed_webhooks_type_last_failed
  on stripe_failed_webhook_events (event_type, last_failed_at desc);

create index if not exists idx_failed_webhooks_account_last_failed
  on stripe_failed_webhook_events (stripe_account_id, last_failed_at desc);

create index if not exists idx_failed_webhooks_affected_user
  on stripe_failed_webhook_events (affected_user_id, last_failed_at desc);

create or replace function set_failed_webhooks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_failed_webhooks_updated_at on stripe_failed_webhook_events;
create trigger trg_failed_webhooks_updated_at
before update on stripe_failed_webhook_events
for each row execute function set_failed_webhooks_updated_at();

alter table stripe_failed_webhook_events enable row level security;
alter table stripe_failed_webhook_events force row level security;
