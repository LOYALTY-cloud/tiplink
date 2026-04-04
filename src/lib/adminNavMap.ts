export type NavSection = {
  name: string
  description: string
  routes: string[]
  keywords: string[]
}

export const ADMIN_NAV_MAP: Record<string, NavSection> = {
  dashboard: {
    name: "Dashboard",
    description: "Overview of platform stats, risk alerts, and recent activity",
    routes: ["/admin", "/admin/dashboard"],
    keywords: [
      "overview", "stats", "risk alerts", "home", "summary",
      "active disputes", "recent activity", "quick stats",
    ],
  },
  users: {
    name: "Users",
    description: "User accounts, profiles, verification, and account status management",
    routes: ["/admin/users"],
    keywords: [
      "users", "profiles", "account status", "verification",
      "restrict", "suspend", "close account", "flag", "unflag",
      "user detail", "role", "kyc", "identity",
    ],
  },
  transactions: {
    name: "Transactions",
    description: "All tips, payments, withdrawals, and transaction history",
    routes: ["/admin/transactions"],
    keywords: [
      "transactions", "tips", "payments", "withdrawals", "history",
      "payout", "ledger", "transfer", "amount",
    ],
  },
  disputes: {
    name: "Disputes",
    description: "Chargebacks, dispute management, and evidence submission",
    routes: ["/admin/disputes"],
    keywords: [
      "disputes", "chargebacks", "chargeback", "dispute status",
      "evidence", "respond", "stripe dispute", "lost", "won",
    ],
  },
  refunds: {
    name: "Refunds",
    description: "Refund requests, approvals, and processing",
    routes: ["/admin/refunds"],
    keywords: [
      "refunds", "refund request", "approve refund", "reject refund",
      "refund status", "money back",
    ],
  },
  fraud: {
    name: "Fraud Detection",
    description: "Fraud scoring, risk flags, suspicious activity, and auto-restrictions",
    routes: ["/admin/fraud"],
    keywords: [
      "fraud", "fraud score", "risk", "suspicious", "flagged",
      "auto-restrict", "anomaly", "pattern", "detection",
    ],
  },
  tickets: {
    name: "Tickets",
    description: "Support tickets, SLA tracking, and ticket assignment",
    routes: ["/admin/tickets"],
    keywords: [
      "tickets", "support tickets", "sla", "breach", "assign",
      "priority", "open tickets", "resolve", "escalate",
    ],
  },
  support: {
    name: "Support Sessions",
    description: "Live chat support sessions and conversation management",
    routes: ["/admin/support"],
    keywords: [
      "support", "chat", "conversations", "live chat",
      "session", "messages", "respond",
    ],
  },
  revenue: {
    name: "Revenue",
    description: "Platform earnings, fees, and financial growth metrics",
    routes: ["/admin/revenue"],
    keywords: [
      "revenue", "earnings", "fees", "income", "growth",
      "platform revenue", "money", "financials",
    ],
  },
  activity: {
    name: "Activity Feed",
    description: "Live feed of all admin actions, transactions, and ticket events",
    routes: ["/admin/activity"],
    keywords: [
      "activity", "feed", "live", "actions", "audit",
      "realtime", "events", "log",
    ],
  },
  approvals: {
    name: "Approvals",
    description: "Pending approvals for payouts, verifications, and account changes",
    routes: ["/admin/approvals"],
    keywords: [
      "approvals", "pending", "approve", "reject",
      "waiting", "review",
    ],
  },
  verifications: {
    name: "Verifications",
    description: "Identity verification, document review, and KYC checks",
    routes: ["/admin/verifications"],
    keywords: [
      "verifications", "verify", "documents", "identity",
      "kyc", "id check", "document review",
    ],
  },
  logs: {
    name: "Audit Logs",
    description: "Read-only audit trail of all admin operations",
    routes: ["/admin/logs"],
    keywords: [
      "logs", "audit", "trail", "history", "who did",
      "admin actions", "record",
    ],
  },
  guide: {
    name: "Admin Guide",
    description: "Documentation and how-to guides for admin operations",
    routes: ["/admin/guide"],
    keywords: [
      "guide", "help", "documentation", "how to",
      "tutorial", "instructions",
    ],
  },
}

/**
 * Find the most relevant admin nav section for a user message.
 * Returns the best match based on keyword overlap, or null if no match.
 */
export function findAdminSection(message: string): NavSection | null {
  const text = message.toLowerCase()

  let bestMatch: NavSection | null = null
  let bestScore = 0

  for (const section of Object.values(ADMIN_NAV_MAP)) {
    let score = 0

    // Check name match
    if (text.includes(section.name.toLowerCase())) score += 3

    // Check description words
    const descWords = section.description.toLowerCase().split(/\s+/)
    for (const w of descWords) {
      if (w.length > 3 && text.includes(w)) score += 1
    }

    // Check keyword matches
    for (const kw of section.keywords) {
      if (text.includes(kw)) score += 2
    }

    if (score > bestScore) {
      bestScore = score
      bestMatch = section
    }
  }

  // Require a minimum score to avoid false positives
  return bestScore >= 2 ? bestMatch : null
}

/**
 * Build a context-aware response based on the matched section and current page.
 */
export function buildNavResponse(message: string, currentPage: string): {
  text: string
  action?: { label: string; route: string }
} | null {
  const section = findAdminSection(message)
  if (!section) return null

  const isOnPage = section.routes.some(
    (r) => currentPage === r || currentPage.startsWith(r + "/")
  )

  if (isOnPage) {
    return {
      text: `You're already on the **${section.name}** page. ${section.description}. Look for: ${section.keywords.slice(0, 4).join(", ")}.`,
    }
  }

  return {
    text: `You can find this in the **${section.name}** section — ${section.description}.`,
    action: {
      label: `Go to ${section.name}`,
      route: section.routes[0],
    },
  }
}
