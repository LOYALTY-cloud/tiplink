-- ============================================================
--  1neLink — Security Monitor  (isolated schema)
--
--  All tables are prefixed "security_" and sit completely
--  apart from users / wallets / creators / payouts.
--
--  Removing the monitor:  DROP SCHEMA or DROP TABLE the six
--  tables below.  Nothing else in the app depends on them.
-- ============================================================

-- ── security_events ────────────────────────────────────────
-- Raw events emitted by the app via emitSecurityEvent().
-- The monitor reads these; the app never reads them back.
CREATE TABLE IF NOT EXISTS security_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  type        TEXT        NOT NULL,   -- LOGIN_SUCCESS | PAYOUT_CREATED | ADMIN_ACCESS | …
  ip          TEXT,
  user_id     UUID,                   -- opaque reference — monitor never joins users table
  route       TEXT,
  metadata    JSONB       NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS security_events_occurred_at_idx ON security_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS security_events_type_idx        ON security_events (type);
CREATE INDEX IF NOT EXISTS security_events_ip_idx          ON security_events (ip);

-- ── security_alerts ────────────────────────────────────────
-- Processed alerts produced by the rules engine.
CREATE TABLE IF NOT EXISTS security_alerts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at      TIMESTAMPTZ,
  severity         TEXT        NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  type             TEXT        NOT NULL,   -- AUTH_SPIKE | IP_SWEEP | SCRAPING | STRIPE_ANOMALY | …
  ip_masked        TEXT,                   -- first 3 octets only — full IP never leaves server
  summary          TEXT        NOT NULL,   -- AI-generated, no PII
  playbook         TEXT,                   -- AI-generated remediation steps
  status           TEXT        NOT NULL DEFAULT 'OPEN'
                     CHECK (status IN ('OPEN','CONTAINED','RESOLVED','FALSE_POSITIVE')),
  actions_taken    TEXT[]      NOT NULL DEFAULT '{}',
  resolved_by      TEXT,
  notes            TEXT
);
CREATE INDEX IF NOT EXISTS security_alerts_created_at_idx ON security_alerts (created_at DESC);
CREATE INDEX IF NOT EXISTS security_alerts_status_idx     ON security_alerts (status);
CREATE INDEX IF NOT EXISTS security_alerts_severity_idx   ON security_alerts (severity);

-- ── security_actions ───────────────────────────────────────
-- Audit log of every automated or manual containment action.
CREATE TABLE IF NOT EXISTS security_actions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  alert_id    UUID        REFERENCES security_alerts (id) ON DELETE SET NULL,
  type        TEXT        NOT NULL,   -- BLOCK_IP | REVOKE_SESSION | PAUSE_ENDPOINT | RATE_LIMIT_TIGHTEN
  target      TEXT        NOT NULL,   -- the IP / route / user handle — no raw PII
  result      TEXT        NOT NULL CHECK (result IN ('OK','FAILED','SKIPPED')),
  detail      TEXT,
  triggered_by TEXT       NOT NULL DEFAULT 'auto'   -- 'auto' or admin userId
);
CREATE INDEX IF NOT EXISTS security_actions_alert_id_idx   ON security_actions (alert_id);
CREATE INDEX IF NOT EXISTS security_actions_created_at_idx ON security_actions (created_at DESC);

-- ── security_honeypots ─────────────────────────────────────
-- Every hit on a decoy endpoint.  Any hit = suspicious.
CREATE TABLE IF NOT EXISTS security_honeypots (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip         TEXT,
  ip_masked  TEXT,
  path       TEXT        NOT NULL,
  user_agent TEXT,
  alert_id   UUID        REFERENCES security_alerts (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS security_honeypots_ip_idx         ON security_honeypots (ip);
CREATE INDEX IF NOT EXISTS security_honeypots_created_at_idx ON security_honeypots (created_at DESC);

-- ── security_blocked_ips ───────────────────────────────────
CREATE TABLE IF NOT EXISTS security_blocked_ips (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ,
  ip              TEXT        NOT NULL,
  reason          TEXT        NOT NULL,
  alert_id        UUID        REFERENCES security_alerts (id) ON DELETE SET NULL,
  blocked_by      TEXT        NOT NULL DEFAULT 'auto',
  vercel_rule_id  TEXT,
  active          BOOLEAN     NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS security_blocked_ips_active_ip_idx
  ON security_blocked_ips (ip) WHERE active = true;
CREATE INDEX IF NOT EXISTS security_blocked_ips_expires_at_idx
  ON security_blocked_ips (expires_at) WHERE expires_at IS NOT NULL;

-- ── security_rate_limits ───────────────────────────────────
-- Monitor-owned rate limit overrides (separate from app rate_limits).
-- Used by tighten-rate-limit.ts to temporarily lower thresholds.
CREATE TABLE IF NOT EXISTS security_rate_limits (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ,
  route_pattern   TEXT        NOT NULL,
  limit_per_min   INT         NOT NULL,
  original_limit  INT,
  reason          TEXT,
  alert_id        UUID        REFERENCES security_alerts (id) ON DELETE SET NULL,
  active          BOOLEAN     NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS security_rate_limits_active_route_idx
  ON security_rate_limits (route_pattern) WHERE active = true;

-- ── security_paused_endpoints ──────────────────────────────
-- Kill-switches.  pause-endpoint.ts writes here.
-- isEndpointPaused() checks here — app never polls this table.
CREATE TABLE IF NOT EXISTS security_paused_endpoints (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  route_pattern    TEXT        NOT NULL UNIQUE,
  paused           BOOLEAN     NOT NULL DEFAULT true,
  paused_by        TEXT,
  reason           TEXT,
  auto_resume_at   TIMESTAMPTZ,
  alert_id         UUID        REFERENCES security_alerts (id) ON DELETE SET NULL
);

-- ── RLS: service-role only ─────────────────────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'security_events','security_alerts','security_actions',
    'security_honeypots','security_blocked_ips',
    'security_rate_limits','security_paused_endpoints'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS "no_public_%s" ON %I',
      t, t
    );
    EXECUTE format(
      'CREATE POLICY "no_public_%s" ON %I FOR ALL TO PUBLIC USING (false)',
      t, t
    );
  END LOOP;
END $$;

-- ── maintenance helpers ────────────────────────────────────
CREATE OR REPLACE FUNCTION expire_security_blocks()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE security_blocked_ips
  SET    active = false
  WHERE  active = true AND expires_at IS NOT NULL AND expires_at <= now();

  UPDATE security_rate_limits
  SET    active = false
  WHERE  active = true AND expires_at IS NOT NULL AND expires_at <= now();

  UPDATE security_paused_endpoints
  SET    paused = false, updated_at = now()
  WHERE  paused = true AND auto_resume_at IS NOT NULL AND auto_resume_at <= now();
END;
$$;
