export const appMap = {
  dashboard: {
    name: "Dashboard",
    path: "/dashboard",
    actions: { overview: "View dashboard overview" },
  },
  earnings: {
    name: "Earnings",
    path: "/dashboard/earnings",
    actions: { goal: "Set earnings goal", view: "View earnings stats" },
  },
  profile: {
    name: "Profile",
    path: "/dashboard/profile",
    actions: { edit: "Edit display name, handle, bio, and image" },
  },
  share: {
    name: "Share",
    path: "/dashboard/share",
    actions: { copy: "Copy tip link", qr: "Generate QR code" },
  },
  transactions: {
    name: "Transactions",
    path: "/dashboard/transactions",
    actions: { view: "View transaction history" },
  },
  wallet: {
    name: "Wallet",
    path: "/dashboard/wallet",
    actions: { withdraw: "Withdraw funds", addPayout: "Add payout method" },
  },
  onboarding: {
    name: "Payout Onboarding",
    path: "/dashboard/onboarding",
    actions: { enable: "Enable payouts", complete: "Complete Stripe onboarding" },
  },
  settings: {
    name: "Settings",
    path: "/dashboard/settings",
    actions: { security: "Security settings", deleteAccount: "Delete account" },
  },
  support: {
    name: "Support",
    path: "/dashboard/support",
    actions: { ask: "Ask support assistant" },
  },
  resetPassword: {
    name: "Reset Password",
    path: "/reset-password",
    actions: { reset: "Reset password via email" },
  },
} as const;

/** Build a system prompt snippet listing all app routes for AI context. */
export function appMapContext(): string {
  return Object.values(appMap)
    .map((s) => `- ${s.name}: ${s.path}`)
    .join("\n");
}
