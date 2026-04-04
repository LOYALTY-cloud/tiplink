export type AISection = {
  name: string
  route: string
  navLabel: string
  items: string[]
}

export const AI_MAP: Record<string, AISection> = {
  dashboard: {
    name: "Dashboard",
    route: "/admin",
    navLabel: "Dashboard",
    items: ["dashboard", "overview", "stats", "risk alerts", "summary"],
  },

  disputes: {
    name: "Disputes",
    route: "/admin/disputes",
    navLabel: "Disputes",
    items: ["disputes", "chargebacks", "fraud claims", "evidence", "stripe dispute"],
  },

  transactions: {
    name: "Transactions",
    route: "/admin/transactions",
    navLabel: "Transactions",
    items: ["transactions", "tips", "payments", "refunds", "withdrawals", "payout", "ledger"],
  },

  users: {
    name: "Users",
    route: "/admin/users",
    navLabel: "Users",
    items: ["users", "profiles", "accounts", "verification", "restrict", "suspend", "flag"],
  },

  revenue: {
    name: "Revenue",
    route: "/admin/revenue",
    navLabel: "Revenue",
    items: ["revenue", "earnings", "fees", "income", "financials"],
  },

  support: {
    name: "Support",
    route: "/admin/support",
    navLabel: "Support",
    items: ["support", "tickets", "chat", "live chat", "conversations", "sla"],
  },

  fraud: {
    name: "Fraud Detection",
    route: "/admin/fraud",
    navLabel: "Fraud",
    items: ["fraud", "fraud score", "risk", "suspicious", "flagged", "anomaly"],
  },

  refunds: {
    name: "Refunds",
    route: "/admin/refunds",
    navLabel: "Refunds",
    items: ["refunds", "refund request", "money back"],
  },

  activity: {
    name: "Activity Feed",
    route: "/admin/activity",
    navLabel: "Activity",
    items: ["activity", "feed", "audit", "realtime", "events", "log"],
  },

  approvals: {
    name: "Approvals",
    route: "/admin/approvals",
    navLabel: "Approvals",
    items: ["approvals", "pending", "approve", "reject", "review"],
  },

  verifications: {
    name: "Verifications",
    route: "/admin/verifications",
    navLabel: "Verifications",
    items: ["verifications", "verify", "documents", "identity", "kyc"],
  },

  logs: {
    name: "Audit Logs",
    route: "/admin/logs",
    navLabel: "Logs",
    items: ["logs", "audit trail", "history", "admin actions"],
  },

  guide: {
    name: "Admin Guide",
    route: "/admin/guide",
    navLabel: "Guide",
    items: ["guide", "help", "documentation", "how to", "instructions"],
  },
}
