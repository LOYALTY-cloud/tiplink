/**
 * Collector: Stripe — reads recent payout / balance events.
 * Requires STRIPE_SECRET_KEY. Gracefully skips if not configured.
 */

import { createLogger } from "../utils/logger";
import { securityConfig } from "../config/security-config";

const log = createLogger("collect-stripe");

export interface StripePayoutSummary {
  recentPayouts: Array<{ amount: number; currency: string; created: number; status: string }>;
  totalCount: number;
  largestAmount: number;
}

export async function collectStripePayouts(windowMinutes: number): Promise<StripePayoutSummary> {
  const empty: StripePayoutSummary = { recentPayouts: [], totalCount: 0, largestAmount: 0 };

  if (!securityConfig.stripeSecret) {
    log.warn("STRIPE_SECRET_KEY not set — skipping Stripe collector");
    return empty;
  }

  const since = Math.floor((Date.now() - windowMinutes * 60 * 1000) / 1000);

  try {
    const res = await fetch(
      `https://api.stripe.com/v1/payouts?limit=50&created[gte]=${since}`,
      {
        headers: { Authorization: `Bearer ${securityConfig.stripeSecret}` },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!res.ok) {
      log.warn("Stripe API error", { status: res.status });
      return empty;
    }

    const body = await res.json() as { data?: Array<{ amount: number; currency: string; created: number; status: string }> };
    const payouts = body.data ?? [];

    const largestAmount = payouts.reduce((max, p) => Math.max(max, p.amount / 100), 0);

    // Return only aggregate-safe fields — no account IDs, names, etc.
    return {
      recentPayouts: payouts.map((p) => ({
        amount: p.amount / 100,
        currency: p.currency,
        created: p.created,
        status: p.status,
      })),
      totalCount: payouts.length,
      largestAmount,
    };
  } catch (err) {
    log.error("Stripe collector failed", { message: String(err) });
    return empty;
  }
}
