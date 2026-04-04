/**
 * Fraud Orchestrator — combines rule engine + behavior analysis + AI scoring.
 *
 * Weight distribution:
 *   Rules (existing fraudEngine):  50%  — fast, deterministic, proven
 *   Behavior patterns:             30%  — velocity/volume/card patterns
 *   AI analysis:                   20%  — adaptive anomaly detection
 *
 * Returns a combined score + decision + all flags for admin visibility.
 */

import { analyzeBehavior, type BehaviorEvent } from "./behaviorTracker";
import { aiFraudCheck, type AiFraudContext } from "./aiFraud";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type FraudCheckInput = {
  userId: string | null;
  ip: string;
  amount: number;
  ruleScore: number;       // from existing analyzeTransaction()
  ruleFlags: string[];
  events: BehaviorEvent[]; // recent tip events
  accountAgeHours: number;
  currentRiskScore: number;
  previousRestrictions: number;
  isAnonymous: boolean;
  isVerified?: boolean;    // KYC-verified user
};

export type FraudCheckResult = {
  totalScore: number;
  ruleScore: number;
  behaviorScore: number;
  aiScore: number;
  decision: "allow" | "flag" | "review" | "restrict";
  flags: string[];
  aiReason: string;
};

/**
 * Determine action based on combined score.
 */
function fraudDecision(score: number): "allow" | "flag" | "review" | "restrict" {
  if (score >= 80) return "restrict";
  if (score >= 60) return "review";
  if (score >= 40) return "flag";
  return "allow";
}

/**
 * Run the full hybrid fraud check pipeline.
 */
export async function runFraudCheck(input: FraudCheckInput): Promise<FraudCheckResult> {
  // 1) Behavior analysis (sync, fast)
  const behavior = analyzeBehavior(input.events, {
    currentIp: input.ip,
    accountAgeHours: input.accountAgeHours,
  });

  // 2) AI analysis (async, fail-open)
  const uniqueCards = new Set(input.events.map((e) => e.card_last4).filter(Boolean)).size;
  const uniqueIps = new Set(input.events.map((e) => e.ip).filter(Boolean)).size;
  const totalVolume = input.events.reduce((s, e) => s + e.amount, 0);

  const aiContext: AiFraudContext = {
    amount: input.amount,
    recentTipCount: input.events.length,
    recentTotalVolume: totalVolume,
    uniqueCardsUsed: uniqueCards,
    uniqueIps: uniqueIps,
    accountAgeHours: input.accountAgeHours,
    currentRiskScore: input.currentRiskScore,
    previousRestrictions: input.previousRestrictions,
    isAnonymous: input.isAnonymous,
    timeOfDay: new Date().getHours(),
  };

  const ai = await aiFraudCheck(aiContext);

  // 3) Weighted combination
  let weightedScore =
    input.ruleScore * 0.5 +
    behavior.score * 0.3 +
    ai.score * 0.2;

  // Trust weighting — reduce score for trusted users
  if (input.isVerified) weightedScore -= 10;
  if (input.accountAgeHours > 30 * 24) weightedScore -= 5;  // 30+ day accounts
  if (input.accountAgeHours > 90 * 24) weightedScore -= 3;  // 90+ day bonus
  weightedScore = Math.max(0, weightedScore);

  let totalScore = Math.min(100, Math.round(weightedScore));

  // Cooldown escalation — 3+ flagged anomalies in 10 min → force restrict
  if (input.userId && totalScore >= 30) {
    try {
      const since10m = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { count } = await supabaseAdmin
        .from("fraud_anomalies")
        .select("id", { count: "exact" })
        .eq("user_id", input.userId)
        .gte("score", 30)
        .gt("created_at", since10m);
      if ((count ?? 0) >= 2) {
        // This is the 3rd+ flag in 10 minutes — escalate to restrict
        totalScore = Math.max(totalScore, 80);
      }
    } catch (_) {}
  }

  const decision = fraudDecision(totalScore);
  const allFlags = [...input.ruleFlags, ...behavior.flags];
  if (ai.reason && ai.reason !== "ai_unavailable" && ai.reason !== "ai_no_response") {
    allFlags.push(`ai: ${ai.reason}`);
  }

  // 4) Log anomaly if score warrants attention
  if (totalScore >= 30) {
    try {
      await supabaseAdmin.from("fraud_anomalies").insert({
        user_id: input.userId,
        ip: input.ip || null,
        type: "combined",
        score: totalScore,
        decision,
        reason: allFlags.join(", "),
        flags: allFlags,
        context: {
          rule_score: input.ruleScore,
          behavior_score: behavior.score,
          ai_score: ai.score,
          ai_reason: ai.reason,
          amount: input.amount,
          event_count: input.events.length,
          total_volume: totalVolume,
          unique_cards: uniqueCards,
          unique_ips: uniqueIps,
        },
      });
    } catch (_) {
      // Non-blocking — don't fail the transaction over logging
    }
  }

  // 5) Track behavioral IP / velocity on profile
  if (input.userId) {
    try {
      await supabaseAdmin
        .from("profiles")
        .update({
          last_ip: input.ip || undefined,
          velocity_score: Math.min(100, Math.round(behavior.score)),
        })
        .eq("user_id", input.userId);
    } catch (_) {}
  }

  return {
    totalScore,
    ruleScore: input.ruleScore,
    behaviorScore: behavior.score,
    aiScore: ai.score,
    decision,
    flags: allFlags,
    aiReason: ai.reason,
  };
}

// ── Fraud reason humanization ──────────────────────────────────

const FLAG_LABELS: Record<string, string> = {
  burst_activity: "Unusual burst of activity detected",
  rapid_actions: "Rapid repeated transactions",
  single_card_hammered: "Same card used repeatedly in short window",
  card_fan_out: "Multiple different cards used rapidly",
  volume_spike: "Spending volume spike above normal",
  ip_switching: "Frequent IP address changes",
  new_account_burst: "High activity on a new account",
  micro_transactions: "Pattern of very small test transactions",
  high_amount: "Unusually large transaction amount",
  high_velocity: "High transaction velocity",
  high_frequency: "Too many transactions in time window",
  suspicious_pattern: "Suspicious transaction pattern",
  chargeback_risk: "Elevated chargeback risk",
  card_testing: "Potential card testing behavior",
};

/**
 * Convert internal flag codes into human-readable labels.
 * Unknown flags pass through with title-casing.
 */
export function humanizeFlags(flags: string[]): string[] {
  return flags.map((f) => {
    // Handle "ai: <reason>" prefixed flags
    if (f.startsWith("ai: ")) return f.slice(4);
    return FLAG_LABELS[f] ?? f.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  });
}
