-- Track when a theme entered the pending_review queue.
-- Used by the stale-queue cron to auto-remove themes after 48 hours with no decision.

ALTER TABLE themes
  ADD COLUMN IF NOT EXISTS queue_entered_at timestamptz NULL;

-- Backfill: any theme currently in pending_review gets now() as the entry time
-- (conservative — gives them a fresh 48-hr window from migration time)
UPDATE themes
SET queue_entered_at = now()
WHERE status = 'pending_review'
  AND queue_entered_at IS NULL;

-- Index for the cron query performance
CREATE INDEX IF NOT EXISTS idx_themes_queue_stale
  ON themes (queue_entered_at)
  WHERE status = 'pending_review';
