-- Automated risk engine: evaluate a user and auto-restrict if rules trigger.
-- Returns a jsonb summary of which rules fired.
CREATE OR REPLACE FUNCTION evaluate_risk_rules(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_refunds_24h int;
  v_disputes int;
  v_owed numeric;
  v_withdraw_1h numeric;
  v_result jsonb := '[]'::jsonb;
  v_should_restrict boolean := false;
  v_reasons text[] := '{}';
BEGIN
  -- Rule 1: >3 refunds in last 24 hours
  SELECT count(*) INTO v_refunds_24h
  FROM tip_intents
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
  FROM tip_intents
  WHERE creator_user_id = p_user_id
    AND status = 'disputed';

  IF v_disputes >= 1 THEN
    v_should_restrict := true;
    v_reasons := array_append(v_reasons, 'has_disputes');
    v_result := v_result || jsonb_build_object('rule', 'disputes', 'value', v_disputes, 'threshold', 1);
  END IF;

  -- Rule 3: owed balance > 0
  SELECT COALESCE(owed_balance, 0) INTO v_owed
  FROM profiles
  WHERE user_id = p_user_id;

  IF v_owed > 0 THEN
    v_should_restrict := true;
    v_reasons := array_append(v_reasons, 'owed_balance_positive');
    v_result := v_result || jsonb_build_object('rule', 'owed_balance', 'value', v_owed, 'threshold', 0);
  END IF;

  -- Rule 4: withdrawal velocity > $500 in last hour
  SELECT COALESCE(sum(abs(amount)), 0) INTO v_withdraw_1h
  FROM transactions_ledger
  WHERE user_id = p_user_id
    AND type = 'withdrawal'
    AND created_at >= now() - interval '1 hour';

  IF v_withdraw_1h > 500 THEN
    v_should_restrict := true;
    v_reasons := array_append(v_reasons, 'withdraw_velocity');
    v_result := v_result || jsonb_build_object('rule', 'withdraw_velocity_1h', 'value', v_withdraw_1h, 'threshold', 500);
  END IF;

  -- Apply restriction if any rule fired (only if not already restricted/suspended/closed)
  IF v_should_restrict THEN
    UPDATE profiles
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
