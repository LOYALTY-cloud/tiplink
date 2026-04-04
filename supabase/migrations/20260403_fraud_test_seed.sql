-- ============================================================
-- FRAUD TEST SEED DATA  (idempotent — safe to re-run)
--
-- Creates 3 test profiles (low / medium / high risk) with:
--   • fraud_anomalies at various severity levels
--   • fraud_signals for trust score inputs
--   • admin_actions (freeze, restrict, overrides)
--
-- Test handles:
--   @test_low_risk    — clean user, minor flags
--   @test_med_risk    — suspicious patterns, under review
--   @test_high_risk   — frozen, multiple fraud signals
--
-- ⚠ Uses deterministic UUIDs so re-running is safe (upsert-style).
-- ⚠ Requires auth.users entries OR insert without FK — we use
--    direct profile inserts with ON CONFLICT to be safe.
-- ============================================================

-- Deterministic UUIDs for test users
-- Low:  aaaaaaaa-1111-4000-a000-000000000001
-- Med:  aaaaaaaa-2222-4000-a000-000000000002
-- High: aaaaaaaa-3333-4000-a000-000000000003
-- Admin (system): aaaaaaaa-9999-4000-a000-000000000009

DO $$
DECLARE
  v_low   uuid := 'aaaaaaaa-1111-4000-a000-000000000001';
  v_med   uuid := 'aaaaaaaa-2222-4000-a000-000000000002';
  v_high  uuid := 'aaaaaaaa-3333-4000-a000-000000000003';
  v_admin uuid := 'aaaaaaaa-9999-4000-a000-000000000009';
  v_now   timestamptz := now();
BEGIN

  -- ============================
  -- §0  AUTH USERS (required FK for profiles.user_id)
  -- ============================
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  VALUES
    (v_low,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lucy@test.tiplink.dev',  crypt('TestPass123!', gen_salt('bf')), v_now, v_now - interval '90 days', v_now),
    (v_med,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mike@test.tiplink.dev',  crypt('TestPass123!', gen_salt('bf')), v_now, v_now - interval '20 days', v_now),
    (v_high,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hank@test.tiplink.dev',  crypt('TestPass123!', gen_salt('bf')), v_now, v_now - interval '5 days',  v_now),
    (v_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@test.tiplink.dev', crypt('TestPass123!', gen_salt('bf')), v_now, v_now - interval '365 days', v_now)
  ON CONFLICT (id) DO NOTHING;

  -- ============================
  -- §1  TEST PROFILES
  -- ============================

  -- Low risk user
  INSERT INTO profiles (user_id, handle, display_name, email, role, account_status,
    trust_score, risk_level, risk_score, velocity_score, is_flagged, is_frozen,
    is_verified, last_ip, last_device, created_at)
  VALUES (
    v_low, 'test_low_risk', 'Low Risk Lucy', 'lucy@test.tiplink.dev', 'user', 'active',
    82, 'low', 15, 5, false, false,
    true, '192.168.1.10', 'Chrome/Mac', v_now - interval '90 days'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    handle = EXCLUDED.handle,
    display_name = EXCLUDED.display_name,
    trust_score = EXCLUDED.trust_score,
    risk_level = EXCLUDED.risk_level,
    risk_score = EXCLUDED.risk_score,
    is_flagged = EXCLUDED.is_flagged,
    is_frozen = EXCLUDED.is_frozen,
    account_status = EXCLUDED.account_status;

  -- Medium risk user
  INSERT INTO profiles (user_id, handle, display_name, email, role, account_status,
    trust_score, risk_level, risk_score, velocity_score, is_flagged, is_frozen,
    is_verified, last_ip, last_device, created_at)
  VALUES (
    v_med, 'test_med_risk', 'Medium Risk Mike', 'mike@test.tiplink.dev', 'user', 'active',
    45, 'medium', 55, 40, true, false,
    false, '10.0.0.55', 'Firefox/Windows', v_now - interval '20 days'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    handle = EXCLUDED.handle,
    display_name = EXCLUDED.display_name,
    trust_score = EXCLUDED.trust_score,
    risk_level = EXCLUDED.risk_level,
    risk_score = EXCLUDED.risk_score,
    is_flagged = EXCLUDED.is_flagged,
    is_frozen = EXCLUDED.is_frozen,
    account_status = EXCLUDED.account_status;

  -- High risk user (frozen)
  INSERT INTO profiles (user_id, handle, display_name, email, role, account_status,
    trust_score, risk_level, risk_score, velocity_score, is_flagged, is_frozen,
    freeze_reason, frozen_at, is_verified, last_ip, last_device, created_at)
  VALUES (
    v_high, 'test_high_risk', 'High Risk Hank', 'hank@test.tiplink.dev', 'user', 'restricted',
    12, 'high', 92, 85, true, true,
    'Auto-frozen: rapid withdrawals + chargeback + multi-account signals', v_now - interval '2 hours',
    false, '45.33.99.12', 'Unknown/Android', v_now - interval '5 days'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    handle = EXCLUDED.handle,
    display_name = EXCLUDED.display_name,
    trust_score = EXCLUDED.trust_score,
    risk_level = EXCLUDED.risk_level,
    risk_score = EXCLUDED.risk_score,
    is_flagged = EXCLUDED.is_flagged,
    is_frozen = EXCLUDED.is_frozen,
    freeze_reason = EXCLUDED.freeze_reason,
    frozen_at = EXCLUDED.frozen_at,
    account_status = EXCLUDED.account_status;

  -- System admin (for admin_actions FK)
  INSERT INTO profiles (user_id, handle, display_name, email, role, account_status,
    trust_score, risk_level, created_at)
  VALUES (
    v_admin, 'test_system_admin', 'System Admin', 'admin@test.tiplink.dev', 'super_admin', 'active',
    95, 'low', v_now - interval '365 days'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    handle = EXCLUDED.handle,
    role = EXCLUDED.role;


  -- ============================
  -- §2  FRAUD ANOMALIES
  -- ============================

  -- Clean out old test anomalies
  DELETE FROM fraud_anomalies WHERE user_id IN (v_low, v_med, v_high);

  -- === LOW RISK — 2 minor flags, both allowed ===
  INSERT INTO fraud_anomalies (user_id, ip, type, score, decision, reason, flags, context, created_at)
  VALUES
    (v_low, '192.168.1.10', 'behavior', 18, 'allow', 'Minor velocity bump during sale event',
     ARRAY['activity_spike'], '{"rule_score": 12, "behavior_score": 22, "ai_score": 15, "amount": 25.00}'::jsonb,
     v_now - interval '30 days'),
    (v_low, '192.168.1.10', 'combined', 22, 'allow', 'Slightly unusual login time, no other signals',
     ARRAY['odd_hour'], '{"rule_score": 10, "behavior_score": 30, "ai_score": 18}'::jsonb,
     v_now - interval '10 days');

  -- === MEDIUM RISK — 4 anomalies, escalating severity ===
  INSERT INTO fraud_anomalies (user_id, ip, type, score, decision, reason, flags, context, created_at)
  VALUES
    (v_med, '10.0.0.55', 'behavior', 35, 'flag', 'New device paired with unusual withdrawal pattern',
     ARRAY['new_device', 'amount_outlier'], '{"rule_score": 30, "behavior_score": 40, "ai_score": 28, "amount": 150.00}'::jsonb,
     v_now - interval '15 days'),
    (v_med, '10.0.0.88', 'combined', 52, 'flag', 'IP change detected mid-session with large withdrawal',
     ARRAY['new_ip', 'ip_mismatch', 'large_withdrawal'], '{"rule_score": 45, "behavior_score": 55, "ai_score": 50, "amount": 300.00}'::jsonb,
     v_now - interval '10 days'),
    (v_med, '10.0.0.88', 'ai', 61, 'review', 'AI detected velocity spike — 5 withdrawals in 2 hours',
     ARRAY['velocity_spike', 'rapid_withdrawals'], '{"rule_score": 50, "behavior_score": 68, "ai_score": 62, "amount": 200.00}'::jsonb,
     v_now - interval '5 days'),
    (v_med, '10.0.0.88', 'combined', 58, 'review', 'Sustained suspicious pattern — flagged for review',
     ARRAY['activity_spike', 'new_device'], '{"rule_score": 48, "behavior_score": 62, "ai_score": 55}'::jsonb,
     v_now - interval '2 days');

  -- === HIGH RISK — 6 anomalies, multiple restricts ===
  INSERT INTO fraud_anomalies (user_id, ip, type, score, decision, reason, flags, context, admin_override, created_at)
  VALUES
    (v_high, '45.33.99.12', 'behavior', 45, 'flag', 'New account with immediate large tip claim',
     ARRAY['new_device', 'large_withdrawal'], '{"rule_score": 40, "behavior_score": 50, "ai_score": 38, "amount": 500.00}'::jsonb,
     NULL, v_now - interval '4 days'),
    (v_high, '45.33.99.12', 'combined', 72, 'review', 'Multiple signals converging — chargeback + rapid activity',
     ARRAY['chargeback', 'activity_spike', 'velocity_spike'], '{"rule_score": 68, "behavior_score": 75, "ai_score": 70, "amount": 250.00}'::jsonb,
     NULL, v_now - interval '3 days'),
    (v_high, '91.22.44.8', 'ai', 85, 'restrict', 'AI high-confidence fraud — multi-account + chargeback + VPN',
     ARRAY['multi_account', 'chargeback', 'vpn', 'recent_chargeback'], '{"rule_score": 80, "behavior_score": 88, "ai_score": 85, "amount": 800.00}'::jsonb,
     NULL, v_now - interval '2 days'),
    (v_high, '91.22.44.8', 'combined', 91, 'restrict', 'Escalated — duplicate device fingerprint across 3 accounts',
     ARRAY['duplicate_device', 'multi_account', 'rapid_withdrawals'], '{"rule_score": 88, "behavior_score": 92, "ai_score": 90}'::jsonb,
     'confirmed_fraud', v_now - interval '36 hours'),
    (v_high, '91.22.44.8', 'combined', 95, 'restrict', 'Auto-freeze triggered — trust score below 25 + active chargeback',
     ARRAY['chargeback', 'rapid_withdrawals', 'large_withdrawal', 'suspicious_timing'], '{"rule_score": 92, "behavior_score": 96, "ai_score": 94, "amount": 1200.00}'::jsonb,
     NULL, v_now - interval '2 hours'),
    -- Auto-freeze anomaly (triggers escalation alert in live feed)
    (v_high, '91.22.44.8', 'auto_freeze', 99, 'restrict', 'Account auto-frozen: rapid withdrawals + chargeback + multi-account signals',
     ARRAY['auto_freeze'], '{"freeze_reason": "rapid_withdrawals + chargeback + multi_account"}'::jsonb,
     NULL, v_now - interval '2 hours');


  -- ============================
  -- §3  FRAUD SIGNALS (trust score inputs)
  -- ============================

  DELETE FROM fraud_signals WHERE user_id IN (v_low, v_med, v_high);

  -- Low risk — positive signals
  INSERT INTO fraud_signals (user_id, type, weight, metadata, created_at)
  VALUES
    (v_low, 'account_age_bonus', 20, '{"days": 90}'::jsonb, v_now - interval '90 days'),
    (v_low, 'verified_identity', 15, '{"method": "ocr"}'::jsonb, v_now - interval '60 days'),
    (v_low, 'clean_payout_history', 10, '{"payout_count": 8}'::jsonb, v_now - interval '5 days');

  -- Medium risk — mixed signals
  INSERT INTO fraud_signals (user_id, type, weight, metadata, created_at)
  VALUES
    (v_med, 'new_device', -10, '{"device": "Firefox/Windows"}'::jsonb, v_now - interval '15 days'),
    (v_med, 'ip_change', -5, '{"old_ip": "10.0.0.55", "new_ip": "10.0.0.88"}'::jsonb, v_now - interval '10 days'),
    (v_med, 'velocity_spike', -15, '{"withdrawals_2h": 5}'::jsonb, v_now - interval '5 days'),
    (v_med, 'account_age_bonus', 10, '{"days": 20}'::jsonb, v_now - interval '20 days');

  -- High risk — heavy negative signals
  INSERT INTO fraud_signals (user_id, type, weight, metadata, created_at)
  VALUES
    (v_high, 'new_device', -10, '{"device": "Unknown/Android"}'::jsonb, v_now - interval '5 days'),
    (v_high, 'chargeback', -30, '{"amount": 250.00, "stripe_dispute_id": "dp_test_123"}'::jsonb, v_now - interval '3 days'),
    (v_high, 'multi_account', -25, '{"linked_accounts": 3}'::jsonb, v_now - interval '2 days'),
    (v_high, 'rapid_withdrawals', -20, '{"count": 7, "window_minutes": 30}'::jsonb, v_now - interval '2 days'),
    (v_high, 'vpn_detected', -10, '{"provider": "NordVPN"}'::jsonb, v_now - interval '2 days'),
    (v_high, 'large_withdrawal', -15, '{"amount": 1200.00}'::jsonb, v_now - interval '2 hours');


  -- ============================
  -- §4  ADMIN ACTIONS (timeline events)
  -- ============================

  DELETE FROM admin_actions WHERE target_user IN (v_low, v_med, v_high)
    AND admin_id = v_admin;

  -- Low risk — routine check
  INSERT INTO admin_actions (admin_id, action, target_user, severity, metadata, created_at)
  VALUES
    (v_admin, 'risk_eval', v_low, 'info',
     '{"restricted": false, "trust_score": 82}'::jsonb,
     v_now - interval '5 days');

  -- Medium risk — flag + risk eval
  INSERT INTO admin_actions (admin_id, action, target_user, severity, metadata, created_at)
  VALUES
    (v_admin, 'risk_eval', v_med, 'warning',
     '{"restricted": false, "trust_score": 45, "message": "Under observation"}'::jsonb,
     v_now - interval '5 days'),
    (v_admin, 'auto_restrict', v_med, 'warning',
     '{"reason": "velocity_spike", "message": "5 withdrawals in 2 hours — temporarily restricted"}'::jsonb,
     v_now - interval '3 days');

  -- High risk — full escalation chain
  INSERT INTO admin_actions (admin_id, action, target_user, severity, metadata, created_at)
  VALUES
    (v_admin, 'risk_eval', v_high, 'warning',
     '{"restricted": false, "trust_score": 35}'::jsonb,
     v_now - interval '3 days'),
    (v_admin, 'auto_restrict', v_high, 'critical',
     '{"reason": "chargeback + multi_account", "message": "Multiple high-severity signals detected"}'::jsonb,
     v_now - interval '2 days'),
    (v_admin, 'admin_override', v_high, 'critical',
     '{"anomaly_decision": "confirmed_fraud", "anomaly_score": 91}'::jsonb,
     v_now - interval '36 hours'),
    (v_admin, 'auto_freeze', v_high, 'critical',
     '{"freeze_reason": "rapid_withdrawals + chargeback + multi_account", "trust_score": 12}'::jsonb,
     v_now - interval '2 hours');


  RAISE NOTICE '✅ Fraud test data seeded:';
  RAISE NOTICE '   @test_low_risk  (trust: 82, LOW)   — clean, minor flags only';
  RAISE NOTICE '   @test_med_risk  (trust: 45, MEDIUM) — flagged, under review';
  RAISE NOTICE '   @test_high_risk (trust: 12, HIGH)   — frozen, confirmed fraud';

END $$;
