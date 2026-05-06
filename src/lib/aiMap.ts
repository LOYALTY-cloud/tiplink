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

  staff: {
    name: "Staff",
    route: "/admin/staff",
    navLabel: "Staff",
    items: ["staff", "admins", "team", "moderators", "employees", "hire staff"],
  },

  discipline: {
    name: "Discipline",
    route: "/admin/staff/tickets",
    navLabel: "Discipline",
    items: ["discipline", "disciplinary", "staff ticket", "write up", "warning", "infraction"],
  },

  payroll: {
    name: "Payroll",
    route: "/admin/payroll",
    navLabel: "Payroll",
    items: ["payroll", "salary", "pay", "hours", "wages", "compensation"],
  },

  applicants: {
    name: "Applicants",
    route: "/admin/applicants",
    navLabel: "Applicants",
    items: ["applicants", "applications", "candidates", "hiring", "pipeline", "interview", "offer", "resume", "cover letter"],
  },

  interviews: {
    name: "Interview Calendar",
    route: "/admin/interviews",
    navLabel: "Interview Calendar",
    items: ["interview calendar", "interviews", "interview schedule", "scheduled interviews"],
  },

  overrides: {
    name: "Overrides",
    route: "/admin/overrides",
    navLabel: "Overrides",
    items: ["overrides", "override", "manual override", "force", "override limit", "bypass"],
  },

  ownerAI: {
    name: "Owner AI",
    route: "/admin/owner-ai",
    navLabel: "Owner AI",
    items: ["owner ai", "ai insights", "owner insights", "business intelligence"],
  },

  creatorApplications: {
    name: "Creator Applications",
    route: "/admin/creator-applications",
    navLabel: "Creator Applications",
    items: ["creator applications", "creator apply", "creator requests", "creator approval"],
  },

  eliteApplications: {
    name: "Elite Applications",
    route: "/admin/creators",
    navLabel: "Elite Applications",
    items: ["elite", "elite tier", "elite applications", "elite creators", "elite upgrade"],
  },

  storeHero: {
    name: "Store Hero Ads",
    route: "/admin/store-hero",
    navLabel: "Store Hero Ads",
    items: ["store hero", "hero ads", "banner ads", "store ads", "featured ads"],
  },

  notifications: {
    name: "Notifications",
    route: "/admin/notifications",
    navLabel: "Notifications",
    items: ["notifications", "send notification", "push notification", "broadcast", "alert users"],
  },

  activityCalendar: {
    name: "Activity Calendar",
    route: "/admin/activity-calendar",
    navLabel: "Activity Calendar",
    items: ["activity calendar", "calendar", "activity schedule", "schedule"],
  },

  supportAnalytics: {
    name: "Support Analytics",
    route: "/admin/support/analytics",
    navLabel: "Support Analytics",
    items: ["support analytics", "support stats", "response time", "ticket analytics", "sla analytics"],
  },
}
