/**
 * Alert: Admin in-app notification — creates a notification in admin_notifications.
 */

import { createAdminNotification } from "@/lib/adminNotifications";
import type { SecurityAlert } from "../types/security-event";
import { createLogger } from "../utils/logger";

const log = createLogger("alert-admin-notification");

export async function sendAdminNotification(alert: SecurityAlert): Promise<void> {
  try {
    await createAdminNotification({
      roleTarget: ["owner", "co_owner", "super_admin", "security"],
      type: "security_alert",
      title: `[${alert.severity}] ${alert.type.replace(/_/g, " ")}`,
      message: alert.summary,
      link: "/admin/security",
      priority: alert.severity === "CRITICAL" || alert.severity === "HIGH" ? "critical" : "high",
      requiresAction: alert.severity === "CRITICAL" || alert.severity === "HIGH",
      visibility: "role",
      metadata: {
        alertType: alert.type,
        severity: alert.severity,
        ipMasked: alert.ipMasked ?? null,
        evidence: alert.evidence,
      },
    });
    log.info("Admin notification created", { type: alert.type });
  } catch (err) {
    log.error("Failed to create admin notification", { message: String(err) });
  }
}
