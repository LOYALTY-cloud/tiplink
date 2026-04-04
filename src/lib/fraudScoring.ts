import type { PatternResult } from "./fraudPatternDetector"

export type FraudScoreResult = {
  score: number
  level: "low" | "medium" | "high"
  shouldFlag: boolean
}

const SCORE_WEIGHTS: Record<string, number> = {
  rapid_activity: 20,
  refund_pattern: 30,
  refund_abuse: 50,
  tip_refund_loop: 50,
  escalation_pattern: 25,
  repeated_action: 20,
  role_change: 5,
}

export function calculateFraudScore(patterns: PatternResult[]): FraudScoreResult {
  let score = 0

  for (const p of patterns) {
    score += SCORE_WEIGHTS[p.type] ?? 10
  }

  score = Math.min(score, 100)

  const level: "low" | "medium" | "high" =
    score >= 70 ? "high" : score >= 30 ? "medium" : "low"

  return {
    score,
    level,
    shouldFlag: score >= 70,
  }
}
