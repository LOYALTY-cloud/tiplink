export function wasStripeAccountEverFullyEnabled(
  firstEnabledAt: string | null | undefined,
  onboardingComplete: boolean
): boolean {
  return Boolean(firstEnabledAt) || onboardingComplete;
}

export function shouldRestrictPlatformAccount(
  wasEverFullyEnabled: boolean,
  restrictionLevel: string
): boolean {
  return wasEverFullyEnabled &&
    (restrictionLevel === "high_risk" || restrictionLevel === "restricted");
}