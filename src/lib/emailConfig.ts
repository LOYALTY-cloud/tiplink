/**
 * Centralized email routing configuration for 1neLink.
 *
 * PURPOSE → SENDER EMAIL → DISPLAY NAME
 * ─────────────────────────────────────────────────
 * Security / Auth   → noreply@1nelink.com    → 1neLink Security
 * Receipts / Money  → receipts@1nelink.com   → 1neLink Receipts
 * Support           → support@1nelink.com    → 1neLink Support
 * Legal             → legal@1nelink.com      → 1neLink Legal
 * Internal alerts   → noreply@1nelink.com    → 1neLink Alerts  (to: internal team)
 *
 * Users NEVER see noreply@ or internal emails in the UI.
 */

/* ── From addresses with display names ─────────────────── */

export const EMAIL_FROM = {
  /** Auth: 2FA, password reset, login alerts, wallet unlock codes */
  security: "1neLink Security <noreply@1nelink.com>",

  /** Money: tip sent/received, withdrawal, payment confirmations */
  receipts: "1neLink Receipts <receipts@1nelink.com>",

  /** Support: contact form, help tickets, replies */
  support: "1neLink Support <support@1nelink.com>",

  /** Legal: compliance, terms updates */
  legal: "1neLink Legal <legal@1nelink.com>",

  /** System: program notifications, elite creator applications, transactional */
  system: "1neLink <system@1nelink.com>",

  /** Internal system alerts (from address — recipients are ADMIN_ALERT_RECIPIENTS) */
  alerts: "1neLink Alerts <noreply@1nelink.com>",
} as const;

/* ── Visible contact addresses (safe to show in UI) ────── */

export const CONTACT = {
  support: "support@1nelink.com",
  legal: "legal@1nelink.com",
} as const;

/* ── Internal alert recipients ─────────────────────────── */

const envRecipients = process.env.ADMIN_ALERT_EMAILS;

export const ADMIN_ALERT_RECIPIENTS: string[] = envRecipients
  ? envRecipients.split(",").map((e) => e.trim()).filter(Boolean)
  : ["lisa.francois@1nelink.com"];

/* ── Helper: resolve the correct "from" for a notification type ── */

export type EmailCategory = "security" | "receipts" | "support" | "legal" | "alerts";

export function resolveFrom(category: EmailCategory): string {
  return EMAIL_FROM[category];
}

/**
 * Map notification types to the correct email category.
 */
export function notificationTypeToCategory(
  type: "tip" | "payout" | "payout_requested" | "payout_processing" | "payout_paid" | "payout_failed" | "verification_needed" | "theme_sold" | "theme_unlocked" | "theme_rejected" | "appeal_approved" | "appeal_rejected" | "creator_approved" | "security" | "support",
): EmailCategory {
  switch (type) {
    case "tip":
    case "payout":
    case "payout_requested":
    case "payout_processing":
    case "payout_paid":
    case "payout_failed":
      return "receipts";
    case "theme_sold":
    case "theme_unlocked":
    case "theme_rejected":
    case "appeal_approved":
    case "appeal_rejected":
      return "receipts";
    case "verification_needed":
    case "security":
      return "security";
    case "support":
      return "support";
    default:
      return "security";
  }
}
