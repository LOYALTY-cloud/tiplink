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
  if (score <= 70) return "pending_review";
  return "flagged";
}

export function generateThemeHash(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Centralized protected brand database.
 * Covers major trademark holders across fashion, tech, entertainment, sports, gaming.
 * Matching against this list triggers the keyword risk signal.
 */
export const PROTECTED_BRANDS: string[] = [
  // Tech
  "apple", "google", "microsoft", "samsung", "meta", "facebook", "instagram",
  "twitter", "x.com", "amazon", "netflix", "spotify", "tiktok", "snapchat",
  "youtube", "tesla", "openai",
  // Fashion / Luxury
  "nike", "adidas", "gucci", "louis vuitton", "chanel", "prada", "versace",
  "supreme", "off-white", "balenciaga", "rolex", "dior", "hermes", "burberry",
  "fendi", "yves saint laurent", "givenchy", "alexander mcqueen",
  // Entertainment
  "disney", "marvel", "dc comics", "warner bros", "universal", "paramount",
  "dreamworks", "pixar", "star wars", "harry potter", "pokemon", "nintendo",
  "playstation", "xbox", "fortnite", "roblox",
  // Sports
  "nba", "nfl", "nhl", "mlb", "fifa", "uefa", "olympic", "espn",
  // Banking / Finance
  "visa", "mastercard", "paypal", "stripe", "coinbase",
];

/** @deprecated use PROTECTED_BRANDS */
export const SUSPICIOUS_KEYWORDS = PROTECTED_BRANDS;

export function hasSuspiciousKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  return PROTECTED_BRANDS.some((brand) => lower.includes(brand));
}
