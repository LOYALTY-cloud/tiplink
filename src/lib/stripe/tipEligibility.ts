import type { StripeRestrictionState } from "@/lib/stripe/connectRisk";

export function canStripeAccountAcceptTips(
  chargesEnabled: boolean,
  restrictionState: StripeRestrictionState | null | undefined
): boolean {
  return chargesEnabled &&
    restrictionState !== "high_risk" &&
    restrictionState !== "disconnected";
}