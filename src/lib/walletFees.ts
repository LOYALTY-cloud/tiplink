export type WithdrawalType = "standard" | "instant";

export function getWithdrawalFee(
  _amount: number,
  _type: WithdrawalType = "instant"
): number {
  // Platform charges no withdrawal fee.
  // For instant payouts Stripe's own fee is deducted from the connected
  // account balance automatically — it is not a separate platform charge.
  // Standard payouts have no fee at all.
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
