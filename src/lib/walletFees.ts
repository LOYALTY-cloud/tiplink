export type WithdrawalType = "standard" | "instant";

// Platform fee rate for instant withdrawals.
// This is deducted from the connected account balance AFTER the payout —
// the user receives exactly what they requested; the platform transfers
// this amount from the remaining connected balance to itself.
// Standard withdrawals have no platform fee.
export const PLATFORM_INSTANT_FEE_RATE = 0.05;

export function getWithdrawalFee(
  _amount: number,
  _type: WithdrawalType = "instant"
): number {
  // Fee is not deducted from the user's payout amount — it comes from the
  // connected account balance after payout.  From the user's perspective
  // there is no deduction; they receive exactly what they request.
  return 0;
}

export function getNetWithdrawalAmount(
  amount: number,
  _type: WithdrawalType = "instant"
): number {
  // No platform fee — user receives exactly what they request.
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * 100) / 100;
}

export function formatMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
