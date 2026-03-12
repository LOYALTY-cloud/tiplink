export type WithdrawalType = "standard" | "instant";

export function getWithdrawalFee(
  amount: number,
  type: WithdrawalType = "instant"
): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;

  let fee = 0;

  if (type === "instant") {
    // 5% flat
    fee = amount * 0.05;
  } else {
    // Standard: 3.5% + $0.30
    fee = amount * 0.035 + 0.3;
  }

  // round to 2 decimal places
  return Math.round(fee * 100) / 100;
}

export function getNetWithdrawalAmount(
  amount: number,
  type: WithdrawalType = "instant"
): number {
  const fee = getWithdrawalFee(amount, type);
  return Math.round((amount - fee) * 100) / 100;
}

export function formatMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
