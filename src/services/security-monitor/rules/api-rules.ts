/**
 * Rules: API — rate flood, endpoint enumeration from rate_limits table.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { SecurityAlert } from "../types/security-event";
import { THRESHOLDS } from "../config/thresholds";
import { maskIp, extractIpFromRateLimitKey } from "../utils/ip-reputation";
import { createLogger } from "../utils/logger";

const log = createLogger("api-rules");

export async function runApiRules(since: string): Promise<SecurityAlert[]> {
  const { data, error } = await supabaseAdmin
    .from("rate_limits")
    .select("key, count, reset_at")
    .gte("reset_at", since)
    .order("count", { ascending: false })
    .limit(500);

  if (error) {
    log.error("rate_limits query failed", { message: error.message });
    return [];
  }

  // Group by IP: count distinct actions and total hits
  const ipMap: Record<string, { actions: Set<string>; totalHits: number }> = {};
  for (const row of data ?? []) {
    const ip = extractIpFromRateLimitKey(row.key);
    if (!ip) continue;
    const action = row.key.slice(0, row.key.lastIndexOf(":"));
    if (!ipMap[ip]) ipMap[ip] = { actions: new Set(), totalHits: 0 };
    ipMap[ip].actions.add(action);
    ipMap[ip].totalHits += row.count ?? 1;
  }

  const alerts: SecurityAlert[] = [];
  for (const [ip, stats] of Object.entries(ipMap)) {
    if (stats.actions.size < THRESHOLDS.rateFlood.mediumKeys) continue;

    const severity =
      stats.actions.size >= THRESHOLDS.rateFlood.criticalKeys ||
      stats.totalHits >= THRESHOLDS.rateFlood.criticalHits
        ? "CRITICAL"
        : stats.actions.size >= THRESHOLDS.rateFlood.highKeys
        ? "HIGH"
        : "MEDIUM";

    alerts.push({
      severity,
      type: "RATE_FLOOD",
      ip,
      ipMasked: maskIp(ip),
      summary: `IP exhausted rate limits on ${stats.actions.size} distinct actions (${stats.totalHits} total hits) in ${THRESHOLDS.windowMinutes} min`,
      evidence: {
        distinctActions: stats.actions.size,
        totalHits: stats.totalHits,
        windowMinutes: THRESHOLDS.windowMinutes,
      },
    });
  }

  return alerts;
}
