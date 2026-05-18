/**
 * Prohibited business categories — aligned with Stripe's Restricted Businesses list:
 * https://stripe.com/legal/restricted-businesses
 *
 * Any creator activity category that matches these keywords is blocked
 * BEFORE a Stripe Connect account is created or updated.
 */

export const PROHIBITED_KEYWORDS: string[] = [
  // Adult / explicit content
  "adult",
  "explicit",
  "onlyfans",
  "escort",
  "prostitut",
  "strip club",
  "nude",
  "porn",
  "erotic",
  "sex work",
  "cam girl",
  "cam boy",
  "camming",

  // Gambling / betting
  "gambling",
  "casino",
  "betting",
  "sports bet",
  "lottery",
  "slot",
  "poker",

  // Counterfeit / fake goods
  "counterfeit",
  "replica",
  "fake brand",
  "knockoff",
  "knock-off",
  "fake designer",
  "pirated",

  // Stolen / fraudulent digital assets
  "stolen",
  "hacked account",
  "account cracking",
  "credential",
  "phishing",
  "fraud service",
  "scam",
  "money laundering",

  // Illegal drugs / controlled substances
  "drug",
  "cannabis",
  "marijuana",
  "weed",
  "cocaine",
  "heroin",
  "meth",
  "narcotics",
  "controlled substance",

  // Weapons / dangerous goods
  "firearm",
  "weapon",
  "explosive",
  "ammunition",
  "bomb",

  // Pyramid / MLM / get rich quick
  "pyramid scheme",
  "mlm",
  "multi-level marketing",
  "get rich quick",

  // Hate / extremism
  "hate group",
  "extremist",
  "terrorist",
  "white supremac",
];

/**
 * Returns true if the given category name matches any prohibited keyword.
 * Case-insensitive substring match.
 */
export function isProhibitedCategory(categoryName: string): boolean {
  const lower = categoryName.toLowerCase();
  return PROHIBITED_KEYWORDS.some((keyword) => lower.includes(keyword));
}

/**
 * Returns the matched prohibited keyword(s), or an empty array if none match.
 */
export function getProhibitedMatches(categoryName: string): string[] {
  const lower = categoryName.toLowerCase();
  return PROHIBITED_KEYWORDS.filter((keyword) => lower.includes(keyword));
}
