/**
 * Rules: Admin — anomaly detection on admin_activity_log.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { SecurityAlert } from "../types/security-event";
import { THRESHOLDS } from "../config/thresholds";
import { createLogger } from "../utils/logger";

const log = createLogger("admin-rules");

export async function runAdminRules(since: string): Promise<SecurityAlert[]> {
  const { data, error } = await supabaseAdmin
    .from("admin_activity_log")
    .select("actor, type, action, created_at")
    .gte("created_at", since)
    .limit(500);

  if (error) {
    log.error("admin_activity_log query failed", { message: error.message });
    return [];
  }

  // Count actions per actor
  const actorMap: Record<string, number> = {};
  for (const row of data ?? []) {
    const actor = row.actor ?? "unknown";
    actorMap[actor] = (actorMap[actor] ?? 0) + 1;
  }

  const alerts: SecurityAlert[] = [];
  for (const [actor, count] of Object.entries(actorMap)) {
    if (count < THRESHOLDS.adminAnomaly.medium) continue;
    const severity =
      count >= THRESHOLDS.adminAnomaly.critical ? "CRITICAL"
      : count >= THRESHOLDS.adminAnomaly.high   ? "HIGH"
      : "MEDIUM";

    alerts.push({
      severity,
      type: "ADMIN_ANOMALY",
      summary: `Admin actor performed ${count} actions in ${THRESHOLDS.windowMinutes} min — potential insider threat or compromised admin`,
      evidence: {
        actor: actor.slice(0, 8) + "***",  // mask UUIDs
        actionCount: count,
        windowMinutes: THRESHOLDS.windowMinutes,
      },
    });
  }

  return alerts;
}
