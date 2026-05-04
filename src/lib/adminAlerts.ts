/**
 * Internal admin alert system.
 *
 * Thin wrapper — delegates to the unified email service (emailService.ts).
 * Kept as a separate module so existing imports don't break.
 *
 * Users NEVER see these emails.
 */

import { alertAdmins } from "@/lib/emailService";

export type AlertSeverity = "info" | "warning" | "critical";

interface AdminAlertParams {
  subject: string;
  body: string;
  severity: AlertSeverity;
  meta?: Record<string, string | number | boolean | null | undefined>;
}

/**
 * Fire-and-forget alert to the internal admin team.
 * Never throws — logs errors internally.
 */
export async function sendAdminAlert({
  subject,
  body,
  severity,
  meta,
}: AdminAlertParams): Promise<void> {
  alertAdmins(subject, body, severity, meta);
}
