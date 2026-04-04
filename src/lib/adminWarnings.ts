export type AdminWarning = {
  level: "low" | "medium" | "high"
  message: string
}

type WarningContext = {
  risk_level?: string
  dispute_count?: number
  refund_count?: number
  account_status?: string
  is_flagged?: boolean
  owed_balance?: number
  action?: string
}

export function getAdminWarnings(ctx: WarningContext): AdminWarning[] {
  const warnings: AdminWarning[] = []

  // Risk-level warnings
  if (ctx.risk_level === "high" || ctx.risk_level === "critical") {
    warnings.push({
      level: "high",
      message: "High-risk user — review activity carefully before proceeding.",
    })
  }

  // Dispute warnings
  if ((ctx.dispute_count ?? 0) > 3) {
    warnings.push({
      level: "high",
      message: `${ctx.dispute_count} disputes on record — proceed with extreme caution.`,
    })
  } else if ((ctx.dispute_count ?? 0) > 1) {
    warnings.push({
      level: "medium",
      message: `${ctx.dispute_count} dispute(s) detected — review before action.`,
    })
  }

  // Refund pattern warnings
  if ((ctx.refund_count ?? 0) > 5) {
    warnings.push({
      level: "medium",
      message: "Elevated refund activity detected on this account.",
    })
  }

  // Account status warnings
  if (ctx.account_status === "restricted") {
    warnings.push({
      level: "medium",
      message: "Account is already restricted — further action may escalate.",
    })
  }
  if (ctx.account_status === "suspended") {
    warnings.push({
      level: "high",
      message: "Account is already suspended — this is a severe state change.",
    })
  }

  // Flagged account
  if (ctx.is_flagged) {
    warnings.push({
      level: "medium",
      message: "This account has been manually flagged for review.",
    })
  }

  // Owed balance
  if ((ctx.owed_balance ?? 0) > 0) {
    warnings.push({
      level: "medium",
      message: `User has an outstanding balance of $${Number(ctx.owed_balance).toFixed(2)}.`,
    })
  }

  // Action-specific warnings
  if (ctx.action === "closed") {
    warnings.push({
      level: "high",
      message: "Closing an account is permanent and cannot be easily reversed.",
    })
  }
  if (ctx.action === "suspended") {
    warnings.push({
      level: "high",
      message: "Suspension blocks all user access and payouts immediately.",
    })
  }

  return warnings
}
