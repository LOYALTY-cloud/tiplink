-- Case-insensitive unique index on profiles.handle
-- Prevents "BORNREAL" and "bornreal" from coexisting
-- Safe: all handles are already stored lowercase via .trim().toLowerCase()

-- Drop any existing plain unique constraint on handle if present
DROP INDEX IF EXISTS profiles_handle_unique_ci;

CREATE UNIQUE INDEX profiles_handle_unique_ci
ON profiles (LOWER(handle))
WHERE handle IS NOT NULL;

-- Reserved handles table (system/brand protection)
CREATE TABLE IF NOT EXISTS reserved_handles (
  handle TEXT PRIMARY KEY,
  reason TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed reserved handles
INSERT INTO reserved_handles (handle, reason) VALUES
  ('admin', 'system'), ('administrator', 'system'), ('api', 'system'),
  ('app', 'system'), ('auth', 'system'), ('billing', 'system'),
  ('bot', 'system'), ('dashboard', 'system'), ('dev', 'system'),
  ('help', 'system'), ('home', 'system'), ('info', 'system'),
  ('login', 'system'), ('logout', 'system'), ('mail', 'system'),
  ('mod', 'system'), ('moderator', 'system'), ('official', 'system'),
  ('root', 'system'), ('security', 'system'), ('settings', 'system'),
  ('signup', 'system'), ('staff', 'system'), ('support', 'system'),
  ('system', 'system'), ('test', 'system'), ('webmaster', 'system'),
  ('1nelink', 'brand'), ('onelink', 'brand'), ('tiplink', 'brand'),
  ('about', 'system'), ('account', 'system'), ('blog', 'system'),
  ('contact', 'system'), ('faq', 'system'), ('feedback', 'system'),
  ('news', 'system'), ('press', 'system'), ('privacy', 'system'),
  ('status', 'system'), ('terms', 'system'), ('verify', 'system')
ON CONFLICT (handle) DO NOTHING;

-- Vanity handles table (premium/claimed handles — future monetization)
CREATE TABLE IF NOT EXISTS vanity_handles (
  handle TEXT PRIMARY KEY,
  claimed BOOLEAN DEFAULT false,
  owner_id UUID REFERENCES auth.users(id),
  price INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
