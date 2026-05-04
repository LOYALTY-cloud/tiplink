export const STRIPE_PERCENT = 0.029;
export const STRIPE_FLAT = 0.3;
export const PLATFORM_PERCENT: number = 0;

export function calculateTipFees(amount: number) {
  // Use inverse formula: total = (amount + STRIPE_FLAT) / (1 - STRIPE_PERCENT - PLATFORM_PERCENT)
  // This ensures Stripe's fee on the total charge is fully covered.
  const total = Math.round(((amount + STRIPE_FLAT) / (1 - STRIPE_PERCENT - PLATFORM_PERCENT)) * 100) / 100;
  const stripeFee = Math.round((total * STRIPE_PERCENT + STRIPE_FLAT) * 100) / 100;
  const platformFee = Math.round(total * PLATFORM_PERCENT * 100) / 100;
  const totalFees = Math.round((total - amount) * 100) / 100;

  return {
    stripeFee,
    platformFee,
    totalFees,
    total,
  };
}
