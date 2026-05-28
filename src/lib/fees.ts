// Platform fee: collected by 1neLink via application_fee_amount on every tip.
// Stripe's own processing cost comes out of the platform's collected fee.
export const PLATFORM_PERCENT = 0.029;
export const PLATFORM_FLAT = 0.30;

// Legacy aliases kept for any admin/reporting code that still imports them.
export const STRIPE_PERCENT = 0;
export const STRIPE_FLAT = 0;

export function calculateTipFees(amount: number) {
  // Gross up: customer pays tip + platform fee.
  // total = (amount + PLATFORM_FLAT) / (1 - PLATFORM_PERCENT)
  const total = Math.round(((amount + PLATFORM_FLAT) / (1 - PLATFORM_PERCENT)) * 100) / 100;
  const platformFee = Math.round((total * PLATFORM_PERCENT + PLATFORM_FLAT) * 100) / 100;
  const stripeFee = 0; // Stripe processing cost is absorbed by the platform fee
  const totalFees = Math.round((total - amount) * 100) / 100;

  return {
    stripeFee,
    platformFee,
    totalFees,
    total,
  };
}
