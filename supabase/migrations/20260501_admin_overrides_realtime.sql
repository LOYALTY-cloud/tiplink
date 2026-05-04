-- Enable full row payloads for Supabase Realtime WAL events on admin_overrides.

ALTER TABLE admin_overrides
  REPLICA IDENTITY FULL;
