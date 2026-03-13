-- Add processing_started_at to onboard queue for lock TTL
alter table stripe_onboard_queue
  add column if not exists processing_started_at timestamp with time zone;
