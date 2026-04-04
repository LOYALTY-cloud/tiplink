export const STRIPE_PERCENT = 0.029;
export const STRIPE_FLAT = 0.3;
export const PLATFORM_PERCENT = 0.011;

export function calculateTipFees(amount: number) {
  const stripeFee = Math.round((amount * STRIPE_PERCENT + STRIPE_FLAT) * 100) / 100;
  const platformFee = Math.round(amount * PLATFORM_PERCENT * 100) / 100;
  const totalFees = Math.round((stripeFee + platformFee) * 100) / 100;
  const total = Math.round((amount + totalFees) * 100) / 100;

  return {
    stripeFee,
    platformFee,
    totalFees,
    total,
  };
}
