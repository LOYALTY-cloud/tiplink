-- Atomic refund slice processing: ledger insert + tip_intent update in one transaction.
-- Guarantees no partial writes ever.
CREATE OR REPLACE FUNCTION apply_refund_slice(
  p_tip_id uuid,
  p_user_id uuid,
  p_amount numeric,
  p_refund_id text,
  p_meta jsonb DEFAULT '{}'::jsonb
) RETURNS void AS $$
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

  -- 3) Record in processed_refunds for unique constraint idempotency
  INSERT INTO processed_refunds (refund_id, tip_id, processed_at)
  VALUES (p_refund_id, p_tip_id, now());

  -- 4) Recalculate wallet balance
  PERFORM recalculate_wallet_balance(p_user_id);
END;
$$ LANGUAGE plpgsql;
