-- Trusted devices table: stores recognized devices per user.
-- Powers smart "new device detected" alerts instead of spamming every login.

CREATE TABLE IF NOT EXISTS trusted_devices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_hash    text NOT NULL,         -- SHA-256 fingerprint (User-Agent based)
  device_label   text,                  -- "Chrome on macOS", "Safari on iOS"
  browser_family text,                  -- "Chrome", "Safari", "Firefox", "Edge"
  os_family      text,                  -- "Windows", "macOS", "iOS", "Android", "Linux"
  ip_address     text,                  -- IP at first recognition
  last_ip        text,                  -- IP at most recent login
  last_used_at   timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),

  -- One entry per user+device
  CONSTRAINT uq_user_device UNIQUE (user_id, device_hash)
);

-- Fast lookups: "Has this user logged in from this device before?"
CREATE INDEX IF NOT EXISTS idx_trusted_devices_user_id     ON trusted_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_user_hash   ON trusted_devices(user_id, device_hash);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_last_used   ON trusted_devices(last_used_at DESC);

-- RLS: service role only (API routes insert/read via admin client)
ALTER TABLE trusted_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON trusted_devices
  FOR ALL USING (auth.role() = 'service_role');

-- Cooldown tracker: last time a "new device" email was sent per user.
-- Prevents email spam even when device detection has edge cases.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_device_alert_at timestamptz;
