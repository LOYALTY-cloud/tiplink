-- Creator Strike System
-- Extends the existing creator_strikes table with severity/points/status/issuer.
-- Adds creator_strike_points, creator_risk_level, marketplace_disabled to profiles.
-- Adds a DB function to recalculate risk level from total active strike points.

-- ── 1. Extend creator_strikes ─────────────────────────────────────────────────

ALTER TABLE public.creator_strikes
  ADD COLUMN IF NOT EXISTS severity       text    NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('warning', 'minor', 'major', 'critical')),
  ADD COLUMN IF NOT EXISTS notes          text,
  ADD COLUMN IF NOT EXISTS strike_points  integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status         text    NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'appealed', 'removed', 'expired')),
  ADD COLUMN IF NOT EXISTS issued_by      uuid    REFERENCES public.profiles(id)
    ON DELETE SET NULL;

-- Set default strike_points by severity for existing rows (if any)
UPDATE public.creator_strikes
  SET strike_points = CASE severity
    WHEN 'warning'  THEN 1
    WHEN 'minor'    THEN 2
    WHEN 'major'    THEN 5
    WHEN 'critical' THEN 10
    ELSE 1
  END
  WHERE strike_points = 1 AND severity IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_creator_strikes_status   ON public.creator_strikes (status);
CREATE INDEX IF NOT EXISTS idx_creator_strikes_severity ON public.creator_strikes (severity);
CREATE INDEX IF NOT EXISTS idx_creator_strikes_issued_by ON public.creator_strikes (issued_by);

COMMENT ON COLUMN public.creator_strikes.severity      IS 'warning=1pt, minor=2pt, major=5pt, critical=10pt';
COMMENT ON COLUMN public.creator_strikes.strike_points IS 'Point value counted toward creator_strike_points on profiles.';
COMMENT ON COLUMN public.creator_strikes.status        IS 'active=counts toward total, appealed/removed/expired=excluded.';

-- ── 2. Extend profiles for strike-based enforcement ───────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS creator_strike_points integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS creator_risk_level    text    NOT NULL DEFAULT 'normal'
    CHECK (creator_risk_level IN ('normal', 'watch', 'restricted', 'high_risk', 'banned')),
  ADD COLUMN IF NOT EXISTS marketplace_disabled  boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_creator_risk_level
  ON public.profiles (creator_risk_level)
  WHERE creator_risk_level != 'normal';

CREATE INDEX IF NOT EXISTS idx_profiles_marketplace_disabled
  ON public.profiles (marketplace_disabled)
  WHERE marketplace_disabled = true;

COMMENT ON COLUMN public.profiles.creator_strike_points IS
  'Rolling total of active strike points. Recalculated by recalculate_creator_risk().';
COMMENT ON COLUMN public.profiles.creator_risk_level IS
  'Derived from strike points: normal(<3) watch(3-5) restricted(6-10) high_risk(11-14) banned(15+). Admins can manually override.';
COMMENT ON COLUMN public.profiles.marketplace_disabled IS
  'When true, creator cannot list/sell themes. Set manually by admin or automatically by risk level.';

-- ── 3. Function: recalculate creator risk level from active strike points ─────

CREATE OR REPLACE FUNCTION public.recalculate_creator_risk(p_creator_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_points integer;
  v_risk_level   text;
  v_profile_id   uuid;
BEGIN
  -- Resolve profile id from auth.users id
  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = p_creator_id LIMIT 1;
  IF v_profile_id IS NULL THEN RETURN; END IF;

  -- Sum active strike points
  SELECT COALESCE(SUM(strike_points), 0)
  INTO v_total_points
  FROM public.creator_strikes
  WHERE creator_id = p_creator_id
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > now());

  -- Derive risk level from points
  v_risk_level := CASE
    WHEN v_total_points >= 15 THEN 'banned'
    WHEN v_total_points >= 11 THEN 'high_risk'
    WHEN v_total_points >= 6  THEN 'restricted'
    WHEN v_total_points >= 3  THEN 'watch'
    ELSE 'normal'
  END;

  -- Update profile — marketplace_disabled auto-set at restricted+
  UPDATE public.profiles
  SET
    creator_strike_points = v_total_points,
    creator_risk_level    = v_risk_level,
    -- Auto-disable marketplace at restricted/high_risk/banned; never auto-enable
    -- (admin must manually re-enable to prevent bounce exploits)
    marketplace_disabled  = CASE
      WHEN v_risk_level IN ('restricted', 'high_risk', 'banned') THEN true
      ELSE marketplace_disabled  -- preserve existing value
    END
  WHERE id = v_profile_id;
END;
$$;

COMMENT ON FUNCTION public.recalculate_creator_risk IS
  'Recomputes creator_strike_points and creator_risk_level on profiles. Call after any creator_strikes change.';

-- ── 4. Trigger: auto-recalculate after strike insert/update/delete ────────────

CREATE OR REPLACE FUNCTION public.trg_creator_strike_recalc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_creator_risk(OLD.creator_id);
  ELSE
    PERFORM public.recalculate_creator_risk(NEW.creator_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_creator_strike_recalc ON public.creator_strikes;
CREATE TRIGGER trg_creator_strike_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.creator_strikes
  FOR EACH ROW EXECUTE FUNCTION public.trg_creator_strike_recalc();

-- ── 5. Backfill existing strike counts ───────────────────────────────────────

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT creator_id FROM public.creator_strikes LOOP
    PERFORM public.recalculate_creator_risk(r.creator_id);
  END LOOP;
END;
$$;
