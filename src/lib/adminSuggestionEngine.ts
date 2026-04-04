type Suggestion = {
  text: string
  severity: "info" | "warn" | "danger"
}

type PageContext = {
  page: string
  admin_role?: string
  data?: Record<string, unknown>
}

const routeSuggestions: Record<string, (ctx: PageContext) => Suggestion | null> = {
  "/admin": () => ({
    text: "This is your dashboard overview. Review risk alerts and active disputes first.",
    severity: "info",
  }),

  "/admin/tickets": (ctx) => {
    const open = ctx.data?.open_count
    if (typeof open === "number" && open > 10) {
      return { text: `There are ${open} open tickets. Prioritize SLA-breaching tickets first.`, severity: "warn" }
    }
    return { text: "Check SLA timers and respond to oldest tickets first.", severity: "info" }
  },

  "/admin/users": (ctx) => {
    const fraud = ctx.data?.fraud_score
    if (typeof fraud === "number" && fraud > 70) {
      return { text: "High risk user — review transaction history before approving any action.", severity: "danger" }
    }
    if (typeof fraud === "number" && fraud > 40) {
      return { text: "This user has moderate risk. Check recent refund activity.", severity: "warn" }
    }
    return { text: "Review user status and recent activity before making changes.", severity: "info" }
  },

  "/admin/refunds": () => ({
    text: "Verify the reason and receipt before approving refunds. Check for duplicate requests.",
    severity: "info",
  }),

  "/admin/disputes": () => ({
    text: "Disputes must be responded to within 7 days. Check Stripe evidence requirements.",
    severity: "warn",
  }),

  "/admin/fraud": (ctx) => {
    const alerts = ctx.data?.alert_count
    if (typeof alerts === "number" && alerts > 0) {
      return { text: `${alerts} active fraud alerts. Review flagged accounts before they escalate.`, severity: "danger" }
    }
    return { text: "Monitor high-risk patterns and review flagged transactions.", severity: "info" }
  },

  "/admin/support": () => ({
    text: "Check active chat sessions. Prioritize waiting customers over idle sessions.",
    severity: "info",
  }),

  "/admin/transactions": () => ({
    text: "Use filters to find specific transactions. Check for unusual patterns or amounts.",
    severity: "info",
  }),

  "/admin/approvals": () => ({
    text: "Review pending payout approvals. Verify Stripe status before approving.",
    severity: "info",
  }),

  "/admin/verifications": () => ({
    text: "Verify submitted documents carefully. Cross-check against user profile data.",
    severity: "info",
  }),

  "/admin/revenue": (ctx) => {
    if (ctx.admin_role !== "owner" && ctx.admin_role !== "super_admin") {
      return { text: "Revenue data is restricted. Contact an owner for details.", severity: "warn" }
    }
    return { text: "Review revenue trends and check for unexpected drops in volume.", severity: "info" }
  },

  "/admin/logs": () => ({
    text: "Audit logs are read-only. Use filters to narrow down actions by admin or time range.",
    severity: "info",
  }),

  "/admin/activity": () => ({
    text: "Review recent admin activity. Watch for unusual patterns outside business hours.",
    severity: "info",
  }),
}

export function getSuggestion(ctx: PageContext): Suggestion | null {
  // Exact match first
  const exactFn = routeSuggestions[ctx.page]
  if (exactFn) return exactFn(ctx)

  // Prefix match for sub-routes (e.g., /admin/users/[id])
  for (const [route, fn] of Object.entries(routeSuggestions)) {
    if (ctx.page.startsWith(route + "/")) return fn(ctx)
  }

  return null
}

/** Danger-level data-driven warnings based on context data */
export function getWarnings(ctx: PageContext): string[] {
  const warnings: string[] = []
  const d = ctx.data ?? {}

  if (typeof d.fraud_score === "number" && d.fraud_score > 80) {
    warnings.push("⚠️ Very high fraud score — proceed with extreme caution.")
  }
  if (typeof d.dispute_count === "number" && d.dispute_count > 3) {
    warnings.push("⚠️ This user has multiple disputes. Consider restricting before approving actions.")
  }
  if (typeof d.refund_rate === "number" && d.refund_rate > 0.3) {
    warnings.push("⚠️ High refund rate detected. Review before approving withdrawals.")
  }
  if (d.is_restricted === true) {
    warnings.push("🚫 This account is currently restricted.")
  }
  if (d.stripe_status === "disabled") {
    warnings.push("⚠️ Stripe payouts are disabled for this account.")
  }

  return warnings
}
