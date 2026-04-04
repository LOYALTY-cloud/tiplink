-- ============================================================
-- SECURITY HARDENING: search_path + SECURITY DEFINER on all functions
-- + fix USING (true) RLS policies on admin-only tables
-- (idempotent — safe to re-run)
--
-- Addresses Supabase Security Advisor warnings:
--   ⚠️  Function Search Path Mutable
--   ⚠️  RLS Policy Always True (admin_performance, user_support_history)
-- ============================================================

-- ============================
-- PART A: FIX ALL FUNCTIONS
-- Each function gets:  security definer + set search_path = public
-- ============================

-- ────────────────────────────
-- 1. recalculate_wallet_balance (latest: instant availability)
-- ────────────────────────────
CREATE OR REPLACE FUNCTION public.recalculate_wallet_balance(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric;
BEGIN
  SELECT coalesce(sum(amount), 0)
    INTO v_total
    FROM public.transactions_ledger
   WHERE user_id = p_user_id;

  UPDATE public.wallets
     SET balance   = v_total,
         available  = v_total,
         pending    = 0
   WHERE user_id = p_user_id;

  -- Create wallet row if it doesn't exist
  INSERT INTO public.wallets(user_id, balance, available, pending)
  VALUES (p_user_id, v_total, v_total, 0)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

-- ────────────────────────────
-- 2. purchase_theme_with_balance
-- ────────────────────────────
CREATE OR REPLACE FUNCTION public.purchase_theme_with_balance(
  p_user_id uuid,
  p_theme text,
  p_price_dollars numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance numeric;
  v_exists boolean;
  v_has_bundle boolean;
BEGIN
  -- 1. Lock wallet row (SELECT … FOR UPDATE prevents concurrent purchases)
  SELECT balance INTO v_balance
  FROM public.wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('error', 'wallet_not_found');
  END IF;

  -- 2. Check if user already owns "all" bundle
  SELECT exists(
    SELECT 1 FROM public.theme_purchases
    WHERE user_id = p_user_id AND theme = 'all'
  ) INTO v_has_bundle;

  IF v_has_bundle AND p_theme <> 'all' THEN
    RETURN jsonb_build_object('error', 'already_purchased');
  END IF;

  -- 3. Check if exact theme already purchased
  SELECT exists(
    SELECT 1 FROM public.theme_purchases
    WHERE user_id = p_user_id AND theme = p_theme
  ) INTO v_exists;

  IF v_exists THEN
    RETURN jsonb_build_object('error', 'already_purchased');
  END IF;

  -- 4. Check sufficient balance
  IF v_balance < p_price_dollars THEN
    RETURN jsonb_build_object(
      'error', 'insufficient_balance',
      'balance', v_balance,
      'required', p_price_dollars
    );
  END IF;

  -- 5. Insert ledger entry (append-only, negative = debit)
  INSERT INTO public.transactions_ledger (
    user_id, type, amount, meta, status, created_at
  ) VALUES (
    p_user_id,
    'theme_purchase',
    -p_price_dollars,
    jsonb_build_object(
      'theme', p_theme,
      'price_dollars', p_price_dollars,
      'payment_method', 'wallet_balance'
    ),
    'completed',
    now()
  );

  -- 6. Recalculate wallet balance from ledger (single source of truth)
  PERFORM public.recalculate_wallet_balance(p_user_id);

  -- 7. Record theme purchase
  INSERT INTO public.theme_purchases (user_id, theme, amount)
  VALUES (p_user_id, p_theme, (p_price_dollars * 100)::integer);

  RETURN jsonb_build_object('success', true, 'theme', p_theme);
END;
$$;

-- ────────────────────────────
-- 3. process_tip_succeeded (latest: with ledger)
-- ────────────────────────────
CREATE OR REPLACE FUNCTION public.process_tip_succeeded(
  p_stripe_payment_intent_id text,
  p_creator_user_id uuid,
  p_amount numeric,
  p_platform_fee numeric,
  p_net numeric,
  p_receipt_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count int;
BEGIN
  -- Upsert tip record (prevents duplicates if webhook retries)
  INSERT INTO public.tips (
    stripe_payment_intent_id,
    receiver_user_id,
    amount,
    platform_fee,
    net,
    receipt_id,
    status,
    created_at,
    updated_at
  ) VALUES (
    p_stripe_payment_intent_id,
    p_creator_user_id,
    p_amount,
    p_platform_fee,
    p_net,
    p_receipt_id,
    'succeeded',
    now(),
    now()
  )
  ON CONFLICT (stripe_payment_intent_id) DO UPDATE
  SET status = 'succeeded',
      updated_at = now();

  -- Check if this was a new insert (not an update)
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  -- Only credit wallet and log ledger if newly inserted
  IF inserted_count = 1 THEN
    PERFORM public.ensure_wallet_row(p_creator_user_id);

    UPDATE public.wallets
    SET pending = pending + p_net,
        updated_at = now()
    WHERE user_id = p_creator_user_id;

    -- Insert immutable ledger entry (credit to receiver)
    BEGIN
      INSERT INTO public.transactions_ledger (
        user_id, type, amount, reference_id, created_at, metadata
      ) VALUES (
        p_creator_user_id,
        'tip',
        p_net,
        null,
        now(),
        jsonb_build_object('stripe_payment_intent_id', p_stripe_payment_intent_id, 'receipt_id', p_receipt_id)
      );
    EXCEPTION WHEN others THEN
      RAISE;
    END;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.process_tip_succeeded(text, uuid, numeric, numeric, numeric, text) FROM public;
GRANT EXECUTE ON FUNCTION public.process_tip_succeeded(text, uuid, numeric, numeric, numeric, text) TO authenticated;

-- ────────────────────────────
-- 4. process_payout_failed_or_canceled
-- ────────────────────────────
CREATE OR REPLACE FUNCTION public.process_payout_failed_or_canceled(
  p_withdrawal_id uuid,
  p_user_id uuid,
  p_status text,
  p_stripe_payout_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.withdrawals
  SET status = p_status,
      stripe_payout_id = coalesce(stripe_payout_id, p_stripe_payout_id),
      updated_at = now()
  WHERE id = p_withdrawal_id
    AND user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.process_payout_failed_or_canceled(uuid, uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.process_payout_failed_or_canceled(uuid, uuid, text, text) TO authenticated;

-- ────────────────────────────
-- 5. sync_wallet_from_stripe_balance
-- ────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_wallet_from_stripe_balance(
  p_user_id uuid,
  p_available numeric,
  p_pending numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_wallet_row(p_user_id);

  UPDATE public.wallets
  SET available = greatest(p_available, 0),
      pending   = greatest(p_pending, 0),
      updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_wallet_from_stripe_balance(uuid, numeric, numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.sync_wallet_from_stripe_balance(uuid, numeric, numeric) TO authenticated;

-- ────────────────────────────
-- 6. insert_ledger_entry_with_audit (latest: with recalc)
-- ────────────────────────────
CREATE OR REPLACE FUNCTION public.insert_ledger_entry_with_audit(
  _user_id uuid,
  _type text,
  _amount numeric,
  _reference_id uuid DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _performed_by uuid DEFAULT NULL,
  _action text DEFAULT 'insert',
  _reason text DEFAULT NULL
)
RETURNS table(
  id uuid,
  user_id uuid,
  type text,
  amount numeric,
  reference_id uuid,
  metadata jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.transactions_ledger%rowtype;
BEGIN
  INSERT INTO public.transactions_ledger (user_id, type, amount, reference_id, metadata)
  VALUES (_user_id, _type, _amount, _reference_id, _metadata)
  RETURNING * INTO rec;

  INSERT INTO public.ledger_audit_logs (ledger_id, user_id, performed_by, action, reason, metadata)
  VALUES (rec.id, rec.user_id, _performed_by, _action, _reason, _metadata);

  -- Recalculate wallet balance for the affected user
  PERFORM public.recalculate_wallet_balance(rec.user_id);

  RETURN QUERY SELECT rec.id, rec.user_id, rec.type, rec.amount, rec.reference_id, rec.metadata, rec.created_at;
END;
$$;

-- ────────────────────────────
-- 7. transactions_ledger_prevent_update_delete (trigger)
-- ────────────────────────────
CREATE OR REPLACE FUNCTION public.transactions_ledger_prevent_update_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF tg_op = 'UPDATE' OR tg_op = 'DELETE' THEN
    RAISE EXCEPTION 'transactions_ledger is immutable: % operation not allowed', tg_op;
  END IF;
  RETURN new;
END;
$$;

-- ────────────────────────────
-- 8. increment_risk_score
-- ────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_risk_score(uid uuid, delta int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET risk_score = COALESCE(risk_score, 0) + delta,
      risk_level = CASE
        WHEN COALESCE(risk_score, 0) + delta >= 80 THEN 'high'
        WHEN COALESCE(risk_score, 0) + delta >= 40 THEN 'medium'
        ELSE 'low'
      END
  WHERE id = uid OR user_id = uid;
END;
$$;

-- ────────────────────────────
-- 9. increment_daily_withdrawn
-- ────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_daily_withdrawn(uid uuid, amt numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET daily_withdrawn = COALESCE(daily_withdrawn, 0) + amt
  WHERE id = uid OR user_id = uid;
END;
$$;

-- ────────────────────────────
-- 10. reset_daily_withdrawn
-- ────────────────────────────
CREATE OR REPLACE FUNCTION public.reset_daily_withdrawn()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles SET daily_withdrawn = 0 WHERE daily_withdrawn > 0;
END;
$$;

-- ────────────────────────────
-- 11. increment_restriction_count
-- ────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_restriction_count(uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET restriction_count = COALESCE(restriction_count, 0) + 1
  WHERE id = uid OR user_id = uid;
END;
$$;

-- ────────────────────────────
-- 12. check_rate_limit
-- ────────────────────────────
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text,
  p_limit int,
  p_window_sec int
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
  v_reset_at timestamptz;
  v_now timestamptz := now();
BEGIN
  INSERT INTO rate_limits (key, count, reset_at)
  VALUES (p_key, 1, v_now + (p_window_sec || ' seconds')::interval)
  ON CONFLICT (key) DO UPDATE
    SET
      count = CASE
        WHEN rate_limits.reset_at < v_now THEN 1
        ELSE rate_limits.count + 1
      END,
      reset_at = CASE
        WHEN rate_limits.reset_at < v_now
          THEN v_now + (p_window_sec || ' seconds')::interval
        ELSE rate_limits.reset_at
      END
  RETURNING count, reset_at INTO v_count, v_reset_at;

  RETURN v_count <= p_limit;
END;
$$;

-- ────────────────────────────
-- 13. cleanup_rate_limits
-- ────────────────────────────
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM rate_limits WHERE reset_at < now();
END;
$$;

-- ────────────────────────────
-- 14. evaluate_risk_rules
-- ────────────────────────────
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

  -- Apply restriction if any rule fired
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

-- ────────────────────────────
-- 15. apply_refund_slice
-- ────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_refund_slice(
  p_tip_id uuid,
  p_user_id uuid,
  p_amount numeric,
  p_refund_id text,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tip_amount numeric;
  v_new_total numeric;
  v_is_full boolean;
BEGIN
  -- 1) Insert ledger debit
  INSERT INTO transactions_ledger (user_id, amount, type, reference_id, meta, status, created_at)
  VALUES (
    p_user_id,
    -p_amount,
    'tip_refunded',
    p_tip_id::text,
    p_meta,
    'completed',
    now()
  );

  -- 2) Update tip_intent atomically
  SELECT tip_amount INTO v_tip_amount
  FROM tip_intents WHERE id = p_tip_id FOR UPDATE;

  UPDATE tip_intents
  SET
    refunded_amount = COALESCE(refunded_amount, 0) + p_amount,
    processed_refund_ids = array_append(COALESCE(processed_refund_ids, '{}'), p_refund_id),
    refund_initiated_at = NULL,
    refund_status = CASE
      WHEN (COALESCE(refunded_amount, 0) + p_amount) >= v_tip_amount THEN 'full'
      ELSE 'partial'
    END,
    status = CASE
      WHEN (COALESCE(refunded_amount, 0) + p_amount) >= v_tip_amount THEN 'refunded'
      ELSE 'partially_refunded'
    END,
    last_refund_id = p_refund_id
  WHERE id = p_tip_id;

  -- 3) Record in processed_refunds for idempotency
  INSERT INTO processed_refunds (refund_id, tip_id, processed_at)
  VALUES (p_refund_id, p_tip_id, now());

  -- 4) Recalculate wallet balance
  PERFORM public.recalculate_wallet_balance(p_user_id);
END;
$$;

-- ────────────────────────────
-- 16. mark_stale_admins_offline
-- ────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_stale_admins_offline()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET availability = 'offline'
  WHERE availability IN ('online', 'busy')
    AND role IN ('owner', 'super_admin', 'finance_admin', 'support_admin')
    AND (last_active_at IS NULL OR last_active_at < now() - interval '5 minutes');
END;
$$;

-- ────────────────────────────
-- 17. update_session_last_message (trigger)
-- ────────────────────────────
CREATE OR REPLACE FUNCTION public.update_session_last_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE support_sessions
  SET last_message = NEW.message,
      updated_at = now()
  WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$;

-- ────────────────────────────
-- 18. close_stale_support_sessions (latest: hardened)
-- ────────────────────────────
CREATE OR REPLACE FUNCTION public.close_stale_support_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE support_sessions
  SET status = 'closed',
      closed_by = 'system',
      closed_at = now(),
      updated_at = now()
  WHERE status IN ('waiting', 'active')
    AND updated_at < now() - interval '30 minutes';
END;
$$;


-- ============================
-- PART B: FIX "USING (true)" RLS POLICIES
-- ============================

-- NOTE: "Profiles are viewable by everyone" (profiles table) is intentionally
-- kept as USING (true) because the public tipping page (/[handle]) uses the
-- anon key to look up profiles. Restricting this would break the public flow.
-- Consider migrating the handle page to use service role key in the future.

-- ────────────────────────────
-- B1. user_support_history — restrict to admins only
-- (only if table exists — it depends on support_tickets migration)
-- ────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_support_history') THEN
    EXECUTE 'DROP POLICY IF EXISTS "admins_read_support_history" ON user_support_history';
    EXECUTE $pol$
      CREATE POLICY "admins_read_support_history"
        ON user_support_history FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = auth.uid()
            AND profiles.role IN ('owner', 'super_admin', 'finance_admin', 'support_admin')
          )
        )
    $pol$;

    -- Fix INSERT policy: was WITH CHECK (true) — lock to service role only
    EXECUTE 'DROP POLICY IF EXISTS "service_insert_support_history" ON user_support_history';
    EXECUTE $pol$
      CREATE POLICY "service_insert_support_history"
        ON user_support_history FOR INSERT
        WITH CHECK (false)
    $pol$;
    -- Service role bypasses RLS, so supabaseAdmin inserts still work.
  END IF;
END
$$;

-- ────────────────────────────
-- B2. admin_performance — restrict read to admins, write to service only
-- (only if table exists — it depends on support_tickets migration)
-- ────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_performance') THEN
    EXECUTE 'DROP POLICY IF EXISTS "admins_read_performance" ON admin_performance';
    EXECUTE $pol$
      CREATE POLICY "admins_read_performance"
        ON admin_performance FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = auth.uid()
            AND profiles.role IN ('owner', 'super_admin', 'finance_admin', 'support_admin')
          )
        )
    $pol$;

    EXECUTE 'DROP POLICY IF EXISTS "service_upsert_performance" ON admin_performance';
    EXECUTE $pol$
      CREATE POLICY "service_upsert_performance"
        ON admin_performance FOR ALL
        USING (false)
    $pol$;
    -- Service role bypasses RLS, so backend writes still work.
  END IF;
END
$$;
