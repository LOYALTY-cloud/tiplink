export type CreatorBadge = "bronze" | "silver" | "white" | "blue" | "gold";

export interface TrustFactors {
  sales: number;
  refunds: number;
  reports: number;
  strikes: number;
  accountAge: number; // days
}

export function calculateTrustScore(factors: TrustFactors): number {
  let score = 100;
  score += factors.sales * 0.1;
  score -= factors.refunds * 5;
  score -= factors.reports * 3;
  score -= factors.strikes * 15;
  score += factors.accountAge * 0.05;
  return Math.max(0, Math.min(100, score));
}

export interface BadgeFactors {
  sales: number;
  strikes: number;
  verified: boolean;
  trust: number;
}

export function determineCreatorBadge(factors: BadgeFactors): CreatorBadge {
  if (factors.sales >= 300 && factors.trust >= 90 && factors.strikes === 0) return "gold";
  if (factors.sales >= 200 && factors.verified) return "blue";
  if (factors.sales >= 150 && factors.strikes === 0) return "white";
  if (factors.sales >= 50 && factors.strikes === 0) return "silver";
  return "bronze";
}

export const BADGE_LABELS: Record<CreatorBadge, string> = {
  bronze: "Bronze",
  silver: "Silver",
  white: "White",
  blue: "Blue",
  gold: "Gold",
};

export const BADGE_COLORS: Record<CreatorBadge, string> = {
  bronze: "text-amber-600 bg-amber-600/10 border-amber-600/20",
  silver: "text-zinc-300 bg-zinc-300/10 border-zinc-300/20",
  white: "text-white bg-white/10 border-white/20",
  blue: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  gold: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
};
