import crypto from "crypto";

export type ThemeStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "flagged"
  | "removed"
  | "banned_creator";

export interface RiskFactors {
  logoDetection: boolean;
  duplicateSimilarity: number; // 0–100
  creatorStrikes: number;
  suspiciousKeywords: boolean;
  massUploads: boolean;
}

export function calculateRiskScore(factors: RiskFactors): number {
  let score = 0;
  if (factors.logoDetection) score += 40;
  if (factors.duplicateSimilarity > 80) score += 30;
  if (factors.creatorStrikes > 0) score += 10;
  if (factors.suspiciousKeywords) score += 10;
  if (factors.massUploads) score += 10;
  return Math.min(score, 100);
}

export function determineThemeStatus(score: number): ThemeStatus {
  if (score <= 30) return "approved";
  if (score <= 60) return "pending_review";
  return "flagged";
}

export function generateThemeHash(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export const SUSPICIOUS_KEYWORDS = [
  "official", "verified", "authentic", "licensed",
  "nike", "apple", "gucci", "disney", "supreme",
  "adidas", "louis vuitton", "chanel", "rolex",
];

export function hasSuspiciousKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  return SUSPICIOUS_KEYWORDS.some((kw) => lower.includes(kw));
}
