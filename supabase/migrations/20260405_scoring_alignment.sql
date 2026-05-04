-- Align scoring/fraud system with full withdrawal protection pipeline.
-- Adds missing profile columns, user_baselines table, and fraud_cases table.

-- ────────────────────────────────────────────────────────────
-- 1. Missing profile columns (referenced by code but never created)
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS successful_payouts int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_volume numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_ip text,
  ADD COLUMN IF NOT EXISTS last_device text,
  ADD COLUMN IF NOT EXISTS velocity_score int DEFAULT 0;

-- ────────────────────────────────────────────────────────────
-- 2. user_baselines — per-user behavioral baselines (anti-false-positive)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_baselines (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  avg_daily_volume numeric DEFAULT 0,
  avg_tip_size numeric DEFAULT 0,
  avg_withdrawal numeric DEFAULT 0,
  last_7d_volume numeric DEFAULT 0,
  total_tips_count int DEFAULT 0,
  total_withdrawals_count int DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_baselines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only — user_baselines"
  ON public.user_baselines FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ────────────────────────────────────────────────────────────
-- 3. fraud_cases — open cases for admin review (high-risk withdrawals, anomalies)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fraud_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  risk_score int NOT NULL,
  risk_level text NOT NULL,
  signals jsonb DEFAULT '[]'::jsonb,
  source text NOT NULL DEFAULT 'withdrawal',
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'investigating', 'resolved', 'dismissed')),
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fraud_cases_user_id ON public.fraud_cases(user_id);
CREATE INDEX IF NOT EXISTS idx_fraud_cases_status ON public.fraud_cases(status);
CREATE INDEX IF NOT EXISTS idx_fraud_cases_created ON public.fraud_cases(created_at DESC);

ALTER TABLE public.fraud_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only — fraud_cases"
  ON public.fraud_cases FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ────────────────────────────────────────────────────────────
-- 4. RPC: refresh_user_baseline — called after tips/withdrawals
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.refresh_user_baseline(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_avg_tip numeric;
  v_avg_withdrawal numeric;
  v_7d_volume numeric;
  v_daily_volume numeric;
  v_tip_count int;
  v_withdrawal_count int;
BEGIN
  -- Average tip amount (last 90 days)
  SELECT coalesce(avg(amount), 0), coalesce(count(*), 0)
    INTO v_avg_tip, v_tip_count
    FROM public.transactions_ledger
   WHERE user_id = p_user_id
     AND type = 'tip_received'
     AND created_at >= now() - interval '90 days';

  -- Average withdrawal amount (last 90 days)
  SELECT coalesce(avg(abs(amount)), 0), coalesce(count(*), 0)
    INTO v_avg_withdrawal, v_withdrawal_count
    FROM public.transactions_ledger
   WHERE user_id = p_user_id
     AND type = 'withdrawal'
     AND created_at >= now() - interval '90 days';

  -- Last 7 day volume (absolute sum of all entries)
  SELECT coalesce(sum(abs(amount)), 0)
    INTO v_7d_volume
    FROM public.transactions_ledger
   WHERE user_id = p_user_id
     AND created_at >= now() - interval '7 days';

  -- Average daily volume (last 30 days)
  SELECT coalesce(sum(abs(amount)) / greatest(1, extract(day from now() - min(created_at))::int), 0)
    INTO v_daily_volume
    FROM public.transactions_ledger
   WHERE user_id = p_user_id
     AND created_at >= now() - interval '30 days';

  INSERT INTO public.user_baselines (
    user_id, avg_tip_size, avg_withdrawal, avg_daily_volume,
    last_7d_volume, total_tips_count, total_withdrawals_count, updated_at
  ) VALUES (
    p_user_id, v_avg_tip, v_avg_withdrawal, v_daily_volume,
    v_7d_volume, v_tip_count, v_withdrawal_count, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    avg_tip_size = EXCLUDED.avg_tip_size,
    avg_withdrawal = EXCLUDED.avg_withdrawal,
    avg_daily_volume = EXCLUDED.avg_daily_volume,
    last_7d_volume = EXCLUDED.last_7d_volume,
    total_tips_count = EXCLUDED.total_tips_count,
    total_withdrawals_count = EXCLUDED.total_withdrawals_count,
    updated_at = now();

  -- Also sync successful_payouts and total_volume on profiles
  UPDATE public.profiles SET
    successful_payouts = (
      SELECT count(*) FROM public.withdrawals
       WHERE user_id = p_user_id AND status = 'paid'
    ),
    total_volume = (
      SELECT coalesce(sum(amount), 0) FROM public.transactions_ledger
       WHERE user_id = p_user_id AND type = 'tip_received'
    )
  WHERE user_id = p_user_id;
END;
$$;
