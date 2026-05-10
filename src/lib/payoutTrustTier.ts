export type TrustTier = "new" | "verified" | "trusted" | "established";

export type TrustTierPolicy = {
  label: "New" | "Verified" | "Trusted" | "Established";
  payoutDelayDays: number;
  instantEligible: boolean;
};

export const TRUST_TIER_POLICIES: Record<TrustTier, TrustTierPolicy> = {
  new: {
    label: "New",
    payoutDelayDays: 7,
    instantEligible: false,
  },
  verified: {
    label: "Verified",
    payoutDelayDays: 3,
    instantEligible: false,
  },
  trusted: {
    label: "Trusted",
    payoutDelayDays: 1,
    instantEligible: false,
  },
  established: {
    label: "Established",
    payoutDelayDays: 0,
    instantEligible: true,
  },
};

export function determineTrustTier(input: {
  successfulPayouts: number;
  trustScore: number;
  riskLevel: "low" | "medium" | "high";
}): TrustTier {
  const { successfulPayouts, trustScore, riskLevel } = input;

  if (riskLevel === "high") return "new";

  if (successfulPayouts >= 20 && trustScore >= 85 && riskLevel === "low") {
    return "established";
  }

  if (successfulPayouts >= 8 && trustScore >= 75 && riskLevel === "low") {
    return "trusted";
  }

  if (successfulPayouts >= 3 && trustScore >= 60) {
    return "verified";
  }

  return "new";
}
