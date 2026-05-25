export type StrikeSeverity = "warning" | "minor" | "major" | "critical";
export type CreatorRiskLevel = "normal" | "watch" | "restricted" | "high_risk" | "banned";
export type StrikeStatus = "active" | "appealed" | "removed" | "expired";

export const STRIKE_POINTS: Record<StrikeSeverity, number> = {
  warning: 1,
  minor: 2,
  major: 5,
  critical: 10,
};

export const SEVERITY_LABELS: Record<StrikeSeverity, string> = {
  warning: "Warning",
  minor: "Minor",
  major: "Major",
  critical: "Critical",
};

export const RISK_THRESHOLDS = {
  watch: 3,       // 3–5 pts → watch (notice)
  restricted: 6,  // 6–10 pts → marketplace restrictions
  high_risk: 11,  // 11–14 pts → payout review
  banned: 15,     // 15+ pts → suspension review
} as const;

export const RISK_LEVEL_LABELS: Record<CreatorRiskLevel, string> = {
  normal: "Normal",
  watch: "Watch",
  restricted: "Restricted",
  high_risk: "High Risk",
  banned: "Banned",
};

export const RISK_LEVEL_DESCRIPTIONS: Record<CreatorRiskLevel, string> = {
  normal: "No restrictions apply.",
  watch: "Account is under observation. No restrictions yet.",
  restricted: "Marketplace access restricted. Theme sales disabled.",
  high_risk: "Marketplace restricted and payouts flagged for manual review.",
  banned: "Account suspended from marketplace. All sales and payouts held for review.",
};

export interface CreatorStrike {
  id: string;
  creator_id: string;
  theme_id: string | null;
  reason: string | null;
  expires_at: string | null;
  created_at: string;
  severity: StrikeSeverity;
  notes: string | null;
  strike_points: number;
  status: StrikeStatus;
  issued_by: string | null;
  related_dmca_id: string | null;
  related_report_id: string | null;
  // Joined fields
  issuer_name?: string | null;
  issuer_email?: string | null;
  creator_email?: string | null;
  creator_username?: string | null;
}

export interface IssueStrikePayload {
  creator_id: string;         // auth.users id
  severity: StrikeSeverity;
  reason: string;
  notes?: string;
  theme_id?: string;
  expires_at?: string | null; // ISO date or null = permanent
  related_dmca_id?: string;
  related_report_id?: string;
}
