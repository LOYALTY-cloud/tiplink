-- Freeze levels + rapid-fire velocity detection
-- Applied: 2026-04-05

-- ─────────────────────────────────────────────────────
-- 1. Add freeze_level to profiles (soft | hard)
-- ─────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS freeze_level text DEFAULT 'soft';

-- Backfill: any existing freeze with chargeback/multi-account reason → hard
UPDATE public.profiles
SET freeze_level = 'hard'
WHERE is_frozen = true
  AND (
    freeze_reason ILIKE '%chargeback%'
    OR freeze_reason ILIKE '%multiple account%'
    OR freeze_reason ILIKE '%admin%'
  );

-- ─────────────────────────────────────────────────────
-- 2. Rapid-fire detection RPC
--    Returns withdrawal count + tip-withdraw loop count
--    in the last 30 minutes
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.detect_rapid_fire(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wd_count_30m int;
  v_wd_count_10m int;
  v_loop_count int;
  v_is_rapid boolean := false;
  v_is_loop boolean := false;
BEGIN
  -- Count withdrawals in last 30 min
  SELECT count(*) INTO v_wd_count_30m
  FROM public.withdrawals
  WHERE user_id = p_user_id
    AND created_at >= now() - interval '30 minutes';

  -- Count withdrawals in last 10 min (burst detection)
  SELECT count(*) INTO v_wd_count_10m
  FROM public.withdrawals
  WHERE user_id = p_user_id
    AND created_at >= now() - interval '10 minutes';

  -- Detect tip→withdraw loop: tips received within 5 min before a withdrawal
  -- If user gets a tip and withdraws within 5 min repeatedly, that's suspicious
  SELECT count(*) INTO v_loop_count
  FROM public.withdrawals w
  JOIN public.tip_intents t
    ON t.creator_user_id = w.user_id
    AND t.created_at >= w.created_at - interval '5 minutes'
    AND t.created_at < w.created_at
  WHERE w.user_id = p_user_id
    AND w.created_at >= now() - interval '1 hour';

  -- 3+ in 30 min OR 2+ in 10 min = rapid
  v_is_rapid := (v_wd_count_30m >= 3) OR (v_wd_count_10m >= 2);

  -- 2+ tip→withdraw loops in last hour = suspicious
  v_is_loop := (v_loop_count >= 2);

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'wd_count_30m', v_wd_count_30m,
    'wd_count_10m', v_wd_count_10m,
    'loop_count', v_loop_count,
    'is_rapid', v_is_rapid,
    'is_loop', v_is_loop,
    'detected_at', now()
  );
END;
$$;
