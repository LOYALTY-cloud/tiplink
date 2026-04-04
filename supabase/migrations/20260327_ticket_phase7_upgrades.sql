-- Phase 7: Final upgrades — breach_count + watchers columns
-- Run: psql $DATABASE_URL -f supabase/migrations/20260327_ticket_phase7_upgrades.sql

-- Track how many times a ticket has breached SLA (for tiered escalation)
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS breach_count int NOT NULL DEFAULT 0;

-- Watchers: array of admin user_ids who receive notifications on updates
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS watchers uuid[] NOT NULL DEFAULT '{}';
