/**
 * Rules: Stripe — payout velocity, large single payouts.
 */

import type { SecurityAlert } from "../types/security-event";
import type { StripePayoutSummary } from "../collectors/collect-stripe";
import { THRESHOLDS } from "../config/thresholds";

export function runStripeRules(summary: StripePayoutSummary): SecurityAlert[] {
  const alerts: SecurityAlert[] = [];

  // Rule: High payout velocity
  if (summary.totalCount >= THRESHOLDS.stripeAnomaly.highVelocityCount) {
    alerts.push({
      severity: "HIGH",
      type: "STRIPE_ANOMALY",
      summary: `${summary.totalCount} payouts processed in ${THRESHOLDS.windowMinutes} min — unusually high velocity`,
      evidence: {
        payoutCount: summary.totalCount,
        largestAmountUsd: summary.largestAmount,
        windowMinutes: THRESHOLDS.windowMinutes,
      },
    });
  }

  // Rule: Single very large payout
  if (
    summary.largestAmount >= THRESHOLDS.stripeAnomaly.largeSingleAmount &&
    summary.totalCount < THRESHOLDS.stripeAnomaly.highVelocityCount
  ) {
    alerts.push({
      severity: "MEDIUM",
      type: "STRIPE_ANOMALY",
      summary: `A payout of $${summary.largestAmount.toFixed(2)} was issued — exceeds the large-payout threshold`,
      evidence: {
        largestAmountUsd: summary.largestAmount,
        threshold: THRESHOLDS.stripeAnomaly.largeSingleAmount,
      },
    });
  }

  return alerts;
}
