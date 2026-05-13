import type Stripe from "stripe";

export type StripeRestrictionState = "safe" | "restricted" | "high_risk" | "disconnected";
export type StripeVerificationStatus = "verified" | "pending" | "required" | "restricted" | "disconnected";

export type StripeConnectPolicy = {
  state: StripeRestrictionState;
  verificationStatus: StripeVerificationStatus;
  allowTips: boolean;
  allowPayouts: boolean;
  severity: "info" | "warning" | "critical";
  disabledReason: string | null;
  reasons: string[];
  currentlyDueCount: number;
  futureDueCount: number;
  pastDueCount: number;
};

const HIGH_RISK_DISABLED_REASONS = new Set([
  "listed",
  "rejected.listed",
  "rejected.fraud",
  "rejected.other",
  "rejected.terms_of_service",
  "rejected.platform_fraud",
]);

export function evaluateStripeConnectPolicy(account: Stripe.Account): StripeConnectPolicy {
  const currentlyDue = account.requirements?.currently_due ?? [];
  const futureDue = account.future_requirements?.currently_due ?? [];
  const pastDue = account.requirements?.past_due ?? [];
  const pendingVerification = account.requirements?.pending_verification ?? [];
  const disabledReason = account.requirements?.disabled_reason ?? null;

  const reasons: string[] = [];
  if (disabledReason) reasons.push(`disabled_reason:${disabledReason}`);
  if (currentlyDue.length > 0) reasons.push(`currently_due:${currentlyDue.length}`);
  if (pastDue.length > 0) reasons.push(`past_due:${pastDue.length}`);
  if (pendingVerification.length > 0) reasons.push(`pending_verification:${pendingVerification.length}`);
  if (!account.details_submitted) reasons.push("details_not_submitted");
  if (!account.charges_enabled) reasons.push("charges_disabled");
  if (!account.payouts_enabled) reasons.push("payouts_disabled");

  const isHighRisk = !!disabledReason && HIGH_RISK_DISABLED_REASONS.has(disabledReason);
  const hasRestrictions =
    currentlyDue.length > 0 ||
    pastDue.length > 0 ||
    pendingVerification.length > 0 ||
    !!disabledReason ||
    !account.payouts_enabled;

  let state: StripeRestrictionState = "safe";
  let verificationStatus: StripeVerificationStatus = "verified";
  let severity: "info" | "warning" | "critical" = "info";

  if (isHighRisk) {
    state = "high_risk";
    verificationStatus = "restricted";
    severity = "critical";
  } else if (hasRestrictions) {
    state = "restricted";
    verificationStatus = currentlyDue.length > 0 || pastDue.length > 0 ? "required" : "pending";
    severity = "warning";
  }

  const allowTips = state !== "high_risk" && (state as string) !== "disconnected" && !!account.charges_enabled;
  const allowPayouts = state === "safe" && !!account.payouts_enabled;

  return {
    state,
    verificationStatus,
    allowTips,
    allowPayouts,
    severity,
    disabledReason,
    reasons,
    currentlyDueCount: currentlyDue.length,
    futureDueCount: futureDue.length,
    pastDueCount: pastDue.length,
  };
}
