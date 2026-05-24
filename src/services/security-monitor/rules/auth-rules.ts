/**
 * Rules: Auth — brute force, credential stuffing, auth spike detection.
 */

import type { SecurityAlert } from "../types/security-event";
import type { AuthEventSummary } from "../collectors/collect-auth";
import { THRESHOLDS } from "../config/thresholds";
import { maskIp } from "../utils/ip-reputation";

export function runAuthRules(summary: AuthEventSummary): SecurityAlert[] {
  const alerts: SecurityAlert[] = [];

  // Rule 1: Global auth spike (distributed brute force)
  if (summary.totalFailures >= THRESHOLDS.authSpike.medium) {
    const severity =
      summary.totalFailures >= THRESHOLDS.authSpike.critical ? "CRITICAL"
      : summary.totalFailures >= THRESHOLDS.authSpike.high ? "HIGH"
      : "MEDIUM";

    alerts.push({
      severity,
      type: "AUTH_SPIKE",
      summary: `${summary.totalFailures} authentication failures from ${summary.uniqueTargetedIps} IPs in the last ${THRESHOLDS.windowMinutes} min — possible credential stuffing`,
      evidence: {
        totalFailures: summary.totalFailures,
        uniqueSourceIps: summary.uniqueTargetedIps,
        windowMinutes: THRESHOLDS.windowMinutes,
      },
    });
  }

  // Rule 2: Single-IP brute force (> 20 failures from one IP)
  for (const [ip, count] of Object.entries(summary.failuresByIp)) {
    if (count < 20) continue;
    const severity = count >= 50 ? "CRITICAL" : count >= 35 ? "HIGH" : "MEDIUM";
    alerts.push({
      severity,
      type: "CREDENTIAL_STUFFING",
      ip,
      ipMasked: maskIp(ip),
      summary: `${count} login failures from a single IP in ${THRESHOLDS.windowMinutes} min — brute-force or credential stuffing`,
      evidence: { failureCount: count, windowMinutes: THRESHOLDS.windowMinutes },
    });
  }

  return alerts;
}
