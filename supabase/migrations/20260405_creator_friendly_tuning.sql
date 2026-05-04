-- Creator-friendly tuning: graduated velocity limits + withdraw-all support
-- Applied: 2026-04-05

-- ─────────────────────────────────────────────────────
-- 1. Replace flat $500/hr velocity rule with trust-based velocity
--    LOW risk → no velocity limit
--    MEDIUM risk → $1000/hr
--    HIGH risk → $500/hr
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.evaluate_risk_rules(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refunds_24h int;
  v_disputes int;
  v_owed numeric;
  v_withdraw_1h numeric;
  v_trust_score int;
  v_velocity_limit numeric;
  v_result jsonb := '[]'::jsonb;
  v_should_restrict boolean := false;
  v_reasons text[] := '{}';
BEGIN
  -- Rule 1: >3 refunds in last 24 hours
  SELECT count(*) INTO v_refunds_24h
  FROM public.tip_intents
  WHERE creator_user_id = p_user_id
    AND refund_status IN ('partial', 'full', 'initiated')
    AND created_at >= now() - interval '24 hours';

  IF v_refunds_24h > 3 THEN
    v_should_restrict := true;
    v_reasons := array_append(v_reasons, 'refunds_24h_exceeded');
    v_result := v_result || jsonb_build_object('rule', 'refunds_24h', 'value', v_refunds_24h, 'threshold', 3);
  END IF;

  -- Rule 2: any active disputes
  SELECT count(*) INTO v_disputes
  FROM public.tip_intents
  WHERE creator_user_id = p_user_id
    AND status = 'disputed';

  IF v_disputes >= 1 THEN
    v_should_restrict := true;
    v_reasons := array_append(v_reasons, 'has_disputes');
    v_result := v_result || jsonb_build_object('rule', 'disputes', 'value', v_disputes, 'threshold', 1);
  END IF;

  -- Rule 3: owed balance > 0
  SELECT COALESCE(owed_balance, 0) INTO v_owed
  FROM public.profiles
  WHERE user_id = p_user_id;

  IF v_owed > 0 THEN
    v_should_restrict := true;
    v_reasons := array_append(v_reasons, 'owed_balance_positive');
    v_result := v_result || jsonb_build_object('rule', 'owed_balance', 'value', v_owed, 'threshold', 0);
  END IF;

  -- Rule 4: trust-based withdrawal velocity
  -- LOW risk (score >= 70) → no velocity limit
  -- MEDIUM risk → $1000/hr
  -- HIGH risk (score < 40) → $500/hr
  SELECT COALESCE(trust_score, 50) INTO v_trust_score
  FROM public.profiles
  WHERE user_id = p_user_id;

  IF v_trust_score < 40 THEN
    v_velocity_limit := 500;
  ELSIF v_trust_score < 70 THEN
    v_velocity_limit := 1000;
  ELSE
    v_velocity_limit := NULL; -- no limit for trusted creators
  END IF;

  IF v_velocity_limit IS NOT NULL THEN
    SELECT COALESCE(sum(abs(amount)), 0) INTO v_withdraw_1h
    FROM public.transactions_ledger
    WHERE user_id = p_user_id
      AND type = 'withdrawal'
      AND created_at >= now() - interval '1 hour';

    IF v_withdraw_1h > v_velocity_limit THEN
      v_should_restrict := true;
      v_reasons := array_append(v_reasons, 'withdraw_velocity');
      v_result := v_result || jsonb_build_object(
        'rule', 'withdraw_velocity_1h',
        'value', v_withdraw_1h,
        'threshold', v_velocity_limit,
        'trust_score', v_trust_score
      );
    END IF;
  END IF;

  -- Apply restriction if any rule fired
  IF v_should_restrict THEN
    UPDATE public.profiles
    SET account_status = 'restricted',
        status_reason = 'risk_engine: ' || array_to_string(v_reasons, ', ')
    WHERE user_id = p_user_id
      AND account_status = 'active';
  END IF;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'restricted', v_should_restrict,
    'rules_fired', v_result,
    'evaluated_at', now()
  );
END;
$$;
