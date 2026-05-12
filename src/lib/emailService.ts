/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║             1neLink — Unified Email Service                  ║
 * ║                                                              ║
 * ║  SINGLE GATEWAY for every email the platform sends.          ║
 * ║                                                              ║
 * ║  Flow:  App Event → sendEmail(type, data) → Resend → Inbox  ║
 * ╚═══════════════════════════════════════════════════════════════╝
 *
 * Every email type has:
 *   - A defined EmailType enum value
 *   - A mapped sender address (from emailConfig)
 *   - A subject line
 *   - An HTML template
 *
 * This is the ONLY way production code should send email.
 * Direct Resend calls outside this file are a code smell.
 */

import { getResend } from "@/lib/email";
import {
  EMAIL_FROM,
  ADMIN_ALERT_RECIPIENTS,
  type EmailCategory,
} from "@/lib/emailConfig";

/* ═══════════════════════════════════════════════════════════════
   1.  EMAIL TYPES — the definitive list
   ═══════════════════════════════════════════════════════════════ */

export type EmailType =
  /* ── Security / Auth ─────────────────────────────── */
  | "WALLET_2FA"
  | "WALLET_2FA_DISABLE"
  | "WALLET_2FA_ENABLED"
  | "WALLET_2FA_DISABLED"
  | "PASSWORD_RESET"
  | "EMAIL_VERIFICATION"
  | "NEW_DEVICE_LOGIN"
  | "ACCOUNT_FREEZE"
  /* ── Money ───────────────────────────────────────── */
  | "TIP_RECEIVED"
  | "TIP_RECEIPT"
  | "WITHDRAWAL_SUCCESS"
  | "PAYOUT_FAILED"
  /* ── Support ─────────────────────────────────────── */
  | "SUPPORT_MESSAGE"
  /* ── Admin / Internal ────────────────────────────── */
  | "ADMIN_WELCOME"
  | "ADMIN_ALERT"
  /* ── Elite Creator Program ───────────────────────── */
  | "ELITE_CREATOR_SUBMITTED"
  | "ELITE_CREATOR_APPROVED"
  | "ELITE_CREATOR_REJECTED"
  /* ── Theme Store ─────────────────────────────────── */
  | "MARKETPLACE_STRIKE"
  | "THEME_REJECTED"
  /* ── Notification engine (passthrough) ───────────── */
  | "NOTIFICATION";

/* ═══════════════════════════════════════════════════════════════
   2.  TYPE → CATEGORY MAPPING
   ═══════════════════════════════════════════════════════════════ */

const TYPE_TO_CATEGORY: Record<EmailType, EmailCategory> = {
  // Security
  WALLET_2FA: "security",
  WALLET_2FA_DISABLE: "security",
  WALLET_2FA_ENABLED: "security",
  WALLET_2FA_DISABLED: "security",
  PASSWORD_RESET: "security",
  EMAIL_VERIFICATION: "security",
  NEW_DEVICE_LOGIN: "security",
  ACCOUNT_FREEZE: "security",
  // Money
  TIP_RECEIVED: "receipts",
  TIP_RECEIPT: "receipts",
  WITHDRAWAL_SUCCESS: "receipts",
  PAYOUT_FAILED: "receipts",
  // Support
  SUPPORT_MESSAGE: "support",
  // Admin
  ADMIN_WELCOME: "security",
  ADMIN_ALERT: "alerts",
  // Elite Creator
  ELITE_CREATOR_SUBMITTED: "alerts",
  ELITE_CREATOR_APPROVED: "alerts",
  ELITE_CREATOR_REJECTED: "alerts",
  // Theme Store
  MARKETPLACE_STRIKE: "alerts",
  THEME_REJECTED: "support",
  // Notification engine passthrough
  NOTIFICATION: "security", // overridden at call site
};

/* ═══════════════════════════════════════════════════════════════
   3.  sendEmail — THE SINGLE GATEWAY
   ═══════════════════════════════════════════════════════════════ */

export interface SendEmailParams {
  /** The email event type — determines sender + template routing */
  type: EmailType;
  /** Recipient email address(es) */
  to: string | string[];
  /** Email subject line */
  subject: string;
  /** Pre-built HTML body (templates are built by callers or template helpers) */
  html: string;
  /** Override the default sender category for this type */
  categoryOverride?: EmailCategory;
}

export interface SendEmailResult {
  success: boolean;
  error?: string;
}

/**
 * Send an email through the unified gateway.
 *
 * This is the ONLY function that should call Resend in production.
 * All email sends flow through here for:
 *   - Correct sender routing
 *   - Centralized logging
 *   - Single point of failure handling
 */
export async function sendEmail({
  type,
  to,
  subject,
  html,
  categoryOverride,
}: SendEmailParams): Promise<SendEmailResult> {
  try {
    const category = categoryOverride ?? TYPE_TO_CATEGORY[type];
    const from = EMAIL_FROM[category];

    const resend = getResend();
    const { error } = await resend.emails.send({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    });

    if (error) {
      console.error(`[sendEmail] ${type} failed:`, error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error(`[sendEmail] ${type} exception:`, err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Fire-and-forget variant — never throws, never blocks.
 * Use for non-critical emails (notifications, alerts, receipts).
 */
export function sendEmailAsync(params: SendEmailParams): void {
  sendEmail(params).catch((err) => {
    console.error(`[sendEmailAsync] ${params.type} failed:`, err);
  });
}

/* ═══════════════════════════════════════════════════════════════
   4.  CONVENIENCE WRAPPERS (typed, safe, easy to call)
   ═══════════════════════════════════════════════════════════════ */

/**
 * Send a critical alert to the internal admin team.
 * Fire-and-forget — never throws.
 */
export function alertAdmins(
  subject: string,
  body: string,
  severity: "info" | "warning" | "critical" = "critical",
  meta?: Record<string, string | number | boolean | null | undefined>,
): void {
  if (ADMIN_ALERT_RECIPIENTS.length === 0) return;

  const color =
    severity === "critical" ? "#ef4444" : severity === "warning" ? "#f59e0b" : "#3b82f6";
  const badge =
    severity === "critical" ? "🔴 CRITICAL" : severity === "warning" ? "🟡 WARNING" : "🔵 INFO";

  const formatKey = (k: string) =>
    k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const metaRows = meta
    ? Object.entries(meta)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(
          ([k, v]) =>
            `<tr>
              <td style="color:#9ca3af;padding:6px 16px 6px 0;font-size:13px;white-space:nowrap;vertical-align:top;">${esc(formatKey(k))}</td>
              <td style="color:#6b7280;padding:6px 8px 6px 0;font-size:13px;vertical-align:top;">:</td>
              <td style="color:#f9fafb;font-size:13px;word-break:break-all;vertical-align:top;">${esc(String(v))}</td>
            </tr>`,
        )
        .join("")
    : "";

  const bodyHtml = esc(body).replace(/\n/g, "<br>");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://1nelink.com";

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0b0f1a;color:#e5e7eb;padding:40px 20px;">
    <div style="max-width:540px;margin:0 auto;background:#111827;border-radius:16px;padding:32px;border:1px solid ${color}40;">

      <div style="margin-bottom:20px;display:flex;align-items:center;gap:10px;">
        <span style="display:inline-block;padding:5px 12px;border-radius:8px;background:${color}22;color:${color};font-size:12px;font-weight:700;letter-spacing:0.6px;">${badge}</span>
      </div>

      <h2 style="margin:0 0 10px;color:#f9fafb;font-size:20px;font-weight:700;line-height:1.3;">${esc(subject)}</h2>
      <p style="margin:0 0 24px;color:#9ca3af;font-size:14px;line-height:1.7;">${bodyHtml}</p>

      ${metaRows ? `
      <div style="background:#0f172a;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:16px 18px;margin-bottom:24px;">
        <p style="margin:0 0 10px;color:#6b7280;font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;">Details</p>
        <table style="width:100%;border-spacing:0;border-collapse:collapse;">${metaRows}</table>
      </div>` : ""}

      <a href="${siteUrl}/admin" style="display:inline-block;padding:10px 20px;background:${color};color:#fff;font-size:13px;font-weight:600;border-radius:8px;text-decoration:none;">View in Admin Dashboard →</a>

      <div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:16px;margin-top:24px;">
        <p style="margin:0;color:#4b5563;font-size:11px;">
          1neLink Internal Alert &bull; ${new Date().toISOString()}<br>
          This is an automated system notification. Do not reply.
        </p>
      </div>
    </div>
  </div>`;

  sendEmailAsync({
    type: "ADMIN_ALERT",
    to: ADMIN_ALERT_RECIPIENTS,
    subject: `[${severity.toUpperCase()}] ${subject}`,
    html,
  });
}

/* ═══════════════════════════════════════════════════════════════
   5.  UTILITIES
   ═══════════════════════════════════════════════════════════════ */

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
