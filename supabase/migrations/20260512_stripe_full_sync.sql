-- ============================================================
-- Stripe Full Account Sync System
-- Adds enriched Stripe snapshot columns to profiles,
-- creator_capabilities table, and admin_alerts table.
-- ============================================================

-- ── New profiles columns ────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_account_type        text,
  ADD COLUMN IF NOT EXISTS stripe_country             text,
  ADD COLUMN IF NOT EXISTS stripe_business_type       text,
  ADD COLUMN IF NOT EXISTS stripe_details_submitted   boolean,

  -- Raw requirement arrays (complement the existing _count columns)
  ADD COLUMN IF NOT EXISTS stripe_currently_due       jsonb,
  ADD COLUMN IF NOT EXISTS stripe_eventually_due      jsonb,
  ADD COLUMN IF NOT EXISTS stripe_past_due            jsonb,
  ADD COLUMN IF NOT EXISTS stripe_pending_verification jsonb,

  -- Capability snapshots
  ADD COLUMN IF NOT EXISTS stripe_capabilities            jsonb,
  ADD COLUMN IF NOT EXISTS stripe_card_payments_status    text,
  ADD COLUMN IF NOT EXISTS stripe_transfers_status        text,

  -- Platform-level derived flags (source-of-truth mirror)
  ADD COLUMN IF NOT EXISTS restriction_level          text DEFAULT 'healthy',
  ADD COLUMN IF NOT EXISTS monetization_enabled       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS payouts_allowed            boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS instant_payouts_allowed    boolean DEFAULT false,

  -- Full Stripe account snapshot + audit
  ADD COLUMN IF NOT EXISTS stripe_raw_account         jsonb,
  ADD COLUMN IF NOT EXISTS stripe_last_synced_at      timestamptz;

-- ── creator_capabilities ───────────────────────────────────

CREATE TABLE IF NOT EXISTS creator_capabilities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  capability_name text NOT NULL,
  status          text NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (creator_id, capability_name)
);

CREATE INDEX IF NOT EXISTS idx_creator_capabilities_creator
  ON creator_capabilities (creator_id);

ALTER TABLE creator_capabilities ENABLE ROW LEVEL SECURITY;

-- Service role has full access; no user-facing policies needed
DROP POLICY IF EXISTS "service_role_all" ON creator_capabilities;
CREATE POLICY "service_role_all" ON creator_capabilities
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── admin_alerts ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_alerts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type            text NOT NULL,
  creator_id      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  stripe_account_id text,
  reason          text,
  metadata        jsonb,
  resolved        boolean DEFAULT false,
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_alerts_type_created
  ON admin_alerts (type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_alerts_creator
  ON admin_alerts (creator_id, created_at DESC) WHERE creator_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_admin_alerts_unresolved
  ON admin_alerts (created_at DESC) WHERE resolved = false;

ALTER TABLE admin_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON admin_alerts;
CREATE POLICY "service_role_all" ON admin_alerts
  FOR ALL TO service_role USING (true) WITH CHECK (true);
