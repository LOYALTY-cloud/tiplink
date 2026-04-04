/**
 * Fraud Explanation Generator
 *
 * Produces human-readable explanations of why a user was flagged,
 * combining trust score signals and fraud anomaly context.
 * Used by: AdminRiskCard, admin user detail, fraud dashboard.
 */

export type FraudExplainInput = {
  trust_score: number;
  risk_level: string;
  is_frozen: boolean;
  freeze_reason?: string | null;
  new_device?: boolean;
  new_ip?: boolean;
  large_withdrawal?: boolean;
  recent_chargeback?: boolean;
  multi_account_flag?: boolean;
  activity_spike?: boolean;
  rapid_withdrawals?: boolean;
  is_flagged?: boolean;
};

/**
 * Generate a human-readable fraud explanation from user signals.
 */
export function generateFraudExplanation(user: FraudExplainInput): string {
  const reasons: string[] = [];

  if (user.is_frozen && user.freeze_reason) {
    reasons.push(`Account frozen: ${user.freeze_reason}`);
  }
  if (user.new_device) reasons.push("New device detected");
  if (user.new_ip) reasons.push("New IP address");
  if (user.large_withdrawal) reasons.push("Unusual withdrawal size");
  if (user.recent_chargeback) reasons.push("Recent chargeback");
  if (user.multi_account_flag) reasons.push("Multiple accounts detected");
  if (user.activity_spike) reasons.push("Unusual activity spike");
  if (user.rapid_withdrawals) reasons.push("Rapid withdrawal pattern");
  if (user.is_flagged) reasons.push("Manually flagged by admin");

  if (reasons.length === 0) return "No suspicious activity detected";

  return `User flagged due to: ${reasons.join(", ")}`;
}

/**
 * Build a concise risk summary for display in admin cards/tooltips.
 */
export function buildRiskSummary(user: FraudExplainInput): {
  explanation: string;
  reasons: string[];
  severity: "clear" | "warning" | "danger";
} {
  const reasons: string[] = [];

  if (user.is_frozen) reasons.push(user.freeze_reason ?? "Account frozen");
  if (user.recent_chargeback) reasons.push("Recent chargeback");
  if (user.multi_account_flag) reasons.push("Multi-account signal");
  if (user.large_withdrawal) reasons.push("Unusual withdrawal size");
  if (user.activity_spike) reasons.push("Activity spike");
  if (user.rapid_withdrawals) reasons.push("Rapid withdrawals");
  if (user.new_device) reasons.push("New device");
  if (user.new_ip) reasons.push("New IP");
  if (user.is_flagged) reasons.push("Manually flagged");

  let severity: "clear" | "warning" | "danger" = "clear";
  if (user.risk_level === "high" || user.is_frozen || user.trust_score < 30) {
    severity = "danger";
  } else if (user.risk_level === "medium" || user.trust_score < 60 || user.is_flagged) {
    severity = "warning";
  }

  const explanation =
    reasons.length === 0
      ? "No suspicious activity detected"
      : reasons.join(" · ");

  return { explanation, reasons, severity };
}

/**
 * Compute effective risk level accounting for flags and freeze status.
 * A flagged or frozen profile should never display as "low" risk.
 */
export function effectiveRiskLevel(
  riskLevel: string,
  opts: { is_flagged?: boolean | null; is_frozen?: boolean | null; trust_score?: number | null }
): string {
  if (opts.is_frozen || (opts.trust_score != null && opts.trust_score < 30)) return "high";
  if (opts.is_flagged && riskLevel === "low") return "medium";
  return riskLevel;
}
