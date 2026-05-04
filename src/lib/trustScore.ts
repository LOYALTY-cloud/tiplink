/**
 * Trust Score Engine
 *
 * Calculates a 0–100 trust score for a user profile, deriving a risk level
 * and human-readable reasons. Used by the withdrawal API to determine
 * instant / delayed / review handling.
 */

export type TrustInput = {
  /** Days since account creation */
  account_age_days: number;
  /** Total successful (paid) payouts */
  successful_payouts: number;
  /** Number of chargebacks in the last 30 days */
  chargeback_count_30d: number;
  /** True if user has had consistent activity (no long gaps then spikes) */
  consistent_activity: boolean;
  /** True if current device matches previously-seen device fingerprint */
  same_device: boolean;
  /** True if Stripe identity/KYC is verified */
  stripe_verified: boolean;
  /** True if request originates from a device not seen before */
  new_device: boolean;
  /** True if request IP is not in the user's recent IP set */
  new_ip: boolean;
  /** True if this withdrawal amount exceeds 2× the user's average */
  large_withdrawal: boolean;
  /** True if activity count spiked vs. the user's baseline */
  activity_spike: boolean;
  /** True if user had a chargeback within the last 7 days */
  recent_chargeback: boolean;
  /** True if multi-account linking signals were detected */
  multi_account_flag: boolean;
  /** True if an admin has manually flagged this profile */
  is_flagged?: boolean;
  /** User's total tip volume (builds trust over time) */
  total_volume?: number;
  /** Number of recent ledger anomalies for this user */
  ledger_anomaly_count?: number;
  /** True if rapid-fire withdrawal pattern detected (count-based, not amount) */
  rapid_fire?: boolean;
};

export type TrustResult = {
  score: number;
  risk: "low" | "medium" | "high";
  reasons: string[];
};

export function calculateTrustScore(user: TrustInput): TrustResult {
  let score = 50;
  const reasons: string[] = [];

  // ── POSITIVE signals ────────────────────────
  if (user.account_age_days >= 14) score += 20;
  else if (user.account_age_days >= 7) score += 10;

  if (user.successful_payouts >= 3) score += 20;
  else if (user.successful_payouts >= 1) score += 10;

  if (user.chargeback_count_30d === 0) score += 15;
  if (user.consistent_activity) score += 10;
  if (user.same_device) score += 10;
  if (user.stripe_verified) score += 10;

  // ── NEGATIVE signals ────────────────────────
  if (user.new_device) {
    score -= 15;
    reasons.push("New device detected");
  }
  if (user.new_ip) {
    score -= 10;
    reasons.push("New IP address");
  }
  if (user.large_withdrawal) {
    score -= 20;
    reasons.push("Unusual withdrawal size");
  }
  if (user.activity_spike) {
    score -= 15;
    reasons.push("Recent activity spike");
  }
  if (user.chargeback_count_30d >= 3) {
    score -= 40;
    reasons.push("Chargeback pattern (3+ in 30 days)");
  } else if (user.chargeback_count_30d >= 2) {
    score -= 20;
    reasons.push("Multiple chargebacks (2 in 30 days)");
  } else if (user.chargeback_count_30d >= 1) {
    score -= 10;
    reasons.push("Recent chargeback");
  }
  if (user.multi_account_flag) {
    score -= 25;
    reasons.push("Multi-account signal");
  }
  if (user.rapid_fire) {
    score -= 15;
    reasons.push("Rapid withdrawal pattern");
  }
  if (user.is_flagged) {
    score -= 25;
    reasons.push("Manually flagged by admin");
  }
  const anomalies = user.ledger_anomaly_count ?? 0;
  if (anomalies >= 4) {
    score -= 25;
    reasons.push("Multiple ledger anomalies");
  } else if (anomalies >= 2) {
    score -= 15;
    reasons.push("Repeated ledger anomalies");
  } else if (anomalies >= 1) {
    score -= 8;
    reasons.push("Recent ledger anomaly");
  }

  // Bonus: high-volume creators with clean history get extra trust
  if ((user.total_volume ?? 0) >= 5000 && user.chargeback_count_30d === 0) {
    score += 10;
  }

  score = Math.max(0, Math.min(100, score));

  let risk: "low" | "medium" | "high" = "medium";
  if (score >= 70) risk = "low";
  else if (score < 40) risk = "high";

  // A manually-flagged profile is never "low" risk
  if (user.is_flagged && risk === "low") risk = "medium";

  return { score, risk, reasons };
}
