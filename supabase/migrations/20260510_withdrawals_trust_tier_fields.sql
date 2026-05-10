-- Persist payout trust-tier policy decisions on withdrawals for auditability and UI display.

alter table public.withdrawals
  add column if not exists trust_tier text,
  add column if not exists trust_tier_label text,
  add column if not exists payout_delay_days integer,
  add column if not exists instant_eligible boolean,
  add column if not exists payout_policy_reason text;

comment on column public.withdrawals.trust_tier is 'Internal payout trust-tier key: new | verified | trusted | established.';
comment on column public.withdrawals.trust_tier_label is 'Human-readable payout trust-tier label.';
comment on column public.withdrawals.payout_delay_days is 'Configured payout delay policy days for the withdrawal tier.';
comment on column public.withdrawals.instant_eligible is 'Whether the tier policy allows instant payout.';
comment on column public.withdrawals.payout_policy_reason is 'Explanation for applied payout policy or risk override.';
