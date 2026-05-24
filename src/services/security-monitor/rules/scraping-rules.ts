/**
 * Rules: Scraping — IP sweep (many routes from one IP) + honeypot hits.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { SecurityAlert, SecurityEvent } from "../types/security-event";
import { THRESHOLDS } from "../config/thresholds";
import { maskIp } from "../utils/ip-reputation";
import { createLogger } from "../utils/logger";

const log = createLogger("scraping-rules");

export async function runScrapingRules(
  events: SecurityEvent[],
  since: string
): Promise<SecurityAlert[]> {
  const alerts: SecurityAlert[] = [];

  // Rule 1: IP sweep — one IP hitting many distinct routes
  const ipRouteMap: Record<string, Set<string>> = {};
  for (const e of events) {
    if (!e.ip || !e.route) continue;
    if (!ipRouteMap[e.ip]) ipRouteMap[e.ip] = new Set();
    ipRouteMap[e.ip].add(e.route);
  }

  for (const [ip, routes] of Object.entries(ipRouteMap)) {
    if (routes.size < THRESHOLDS.ipSweep.medium) continue;
    const severity = routes.size >= THRESHOLDS.ipSweep.high ? "HIGH" : "MEDIUM";
    alerts.push({
      severity,
      type: "IP_SWEEP",
      ip,
      ipMasked: maskIp(ip),
      summary: `IP probed ${routes.size} distinct API routes in ${THRESHOLDS.windowMinutes} min — automated scanning or scraping`,
      evidence: {
        distinctRoutes: routes.size,
        windowMinutes: THRESHOLDS.windowMinutes,
      },
    });
  }

  // Rule 2: Honeypot hits
  const { data, error } = await supabaseAdmin
    .from("security_honeypots")
    .select("ip, path, triggered_at")
    .gte("triggered_at", since)
    .limit(200);

  if (error) {
    log.error("security_honeypots query failed", { message: error.message });
  }

  const honeypotHits = data ?? [];
  if (honeypotHits.length > 0) {
    // Group by IP
    const byIp: Record<string, string[]> = {};
    for (const h of honeypotHits) {
      const ip = h.ip ?? "unknown";
      if (!byIp[ip]) byIp[ip] = [];
      byIp[ip].push(h.path ?? "unknown");
    }

    for (const [ip, paths] of Object.entries(byIp)) {
      alerts.push({
        severity: THRESHOLDS.honeypotSeverity,
        type: "HONEYPOT_ACCESS",
        ip,
        ipMasked: maskIp(ip),
        summary: `Decoy endpoint accessed ${paths.length}x — only automated scanners or attackers hit honeypots`,
        evidence: { paths: paths.slice(0, 5), hitCount: paths.length },
      });
    }
  }

  return alerts;
}
