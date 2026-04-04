-- ============================================================
-- Ticket SLA, Internal Notes, and Status Automation
-- ============================================================

-- 1. SLA columns on support_tickets
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS sla_response_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS sla_resolve_deadline  timestamptz,
  ADD COLUMN IF NOT EXISTS first_response_at     timestamptz;

-- 2. Internal notes flag on support_ticket_messages
ALTER TABLE support_ticket_messages
  ADD COLUMN IF NOT EXISTS is_internal boolean DEFAULT false;

-- 3. Source tracking for chat-to-ticket conversion
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'web';
-- source values: 'web' (form), 'chat' (converted from live chat)

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS source_session_id text;

-- Index for SLA breach queries
CREATE INDEX IF NOT EXISTS idx_tickets_sla_response
  ON support_tickets (sla_response_deadline)
  WHERE first_response_at IS NULL AND status IN ('open');

CREATE INDEX IF NOT EXISTS idx_tickets_sla_resolve
  ON support_tickets (sla_resolve_deadline)
  WHERE status IN ('open', 'in_progress');

-- RLS: internal notes should not be visible to users
-- The existing user-facing ticket detail API already filters by sender_type,
-- but we add a policy to enforce it at the DB level too.
-- Drop the old user select policy if it exists, then recreate with is_internal filter.
DROP POLICY IF EXISTS "Users can read own ticket messages" ON support_ticket_messages;
CREATE POLICY "Users can read own ticket messages"
  ON support_ticket_messages FOR SELECT
  USING (
    is_internal = false
    AND EXISTS (
      SELECT 1 FROM support_tickets t
      WHERE t.id = support_ticket_messages.ticket_id
        AND t.user_id = auth.uid()
    )
  );
