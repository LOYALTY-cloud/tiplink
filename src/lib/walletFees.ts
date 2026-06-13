export type WithdrawalType = "standard" | "instant";

// Platform instant withdrawal fee (charged by 1nelink, not Stripe):
//   3.5% of withdrawal amount, minimum $1.00, maximum $75.00
// Fee is deducted FROM the withdrawal amount and transferred to the platform account:
//   user requests $100 → bank gets $96.50, platform gets $3.50
// Note: Stripe also charges its own ~1.5% instant payout service fee on top of this.
// Standard withdrawals have no platform fee.
export const PLATFORM_INSTANT_FEE_RATE = 0.035;
export const PLATFORM_INSTANT_FEE_MIN  = 1.00;
export const PLATFORM_INSTANT_FEE_MAX  = 75.00;

export function getWithdrawalFee(
  amount: number,
  type: WithdrawalType = "instant"
): number {
  if (type !== "instant") return 0;
  const raw = Math.round(amount * PLATFORM_INSTANT_FEE_RATE * 100) / 100;
  return Math.min(Math.max(raw, PLATFORM_INSTANT_FEE_MIN), PLATFORM_INSTANT_FEE_MAX);
}

export function getNetWithdrawalAmount(
  amount: number,
  type: WithdrawalType = "instant"
): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const fee = getWithdrawalFee(amount, type);
  return Math.round((amount - fee) * 100) / 100;
}

export function formatMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
