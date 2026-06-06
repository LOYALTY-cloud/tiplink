export type WithdrawalType = "standard" | "instant";

// Platform fee rate for instant withdrawals.
// The fee is deducted FROM the withdrawal amount — user requests $100,
// receives $95 in their bank, $5 goes to the platform.
// Standard withdrawals have no platform fee.
export const PLATFORM_INSTANT_FEE_RATE = 0.05;

export function getWithdrawalFee(
  amount: number,
  type: WithdrawalType = "instant"
): number {
  if (type !== "instant") return 0;
  return Math.round(amount * PLATFORM_INSTANT_FEE_RATE * 100) / 100;
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
