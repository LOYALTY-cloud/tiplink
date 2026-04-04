/**
 * Transaction-level fraud scoring engine.
 * Complements the DB-level evaluate_risk_rules() RPC
 * by scoring individual transactions in real-time.
 */

export type FraudResult = {
  score: number;
  flags: string[];
  level: "low" | "medium" | "high";
};

export function analyzeTransaction(tx: {
  amount: number;
  isRefund?: boolean;
  recentTips?: number;
  sameCardCount?: number;
  accountAgeHours?: number;
}): FraudResult {
  let score = 0;
  const flags: string[] = [];

  // Large transaction
  if (tx.amount > 500) {
    score += 30;
    flags.push("large_amount");
  } else if (tx.amount > 200) {
    score += 10;
    flags.push("elevated_amount");
  }

  // Rapid activity (>5 tips recently)
  if ((tx.recentTips ?? 0) > 10) {
    score += 40;
    flags.push("burst_activity");
  } else if ((tx.recentTips ?? 0) > 5) {
    score += 25;
    flags.push("rapid_activity");
  }

  // Same card spam (>3 uses)
  if ((tx.sameCardCount ?? 0) > 5) {
    score += 50;
    flags.push("card_abuse");
  } else if ((tx.sameCardCount ?? 0) > 3) {
    score += 40;
    flags.push("card_spam");
  }

  // Refund activity
  if (tx.isRefund) {
    score += 20;
    flags.push("refund_activity");
  }

  // New account
  if ((tx.accountAgeHours ?? Infinity) < 2) {
    score += 15;
    flags.push("new_account");
  }

  const level: FraudResult["level"] =
    score >= 80 ? "high" : score >= 40 ? "medium" : "low";

  return { score, flags, level };
}
