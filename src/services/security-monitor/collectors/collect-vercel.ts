/**
 * Collector: Vercel — reads runtime log drains / firewall events.
 * Requires VERCEL_API_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID.
 * Gracefully skips if not configured (Vercel log drain also requires paid plan).
 *
 * For now this pulls recent firewall events from the Vercel REST API.
 * Full log drain integration can be added when a Pro/Enterprise plan is active.
 */

import { createLogger } from "../utils/logger";
import { securityConfig } from "../config/security-config";

const log = createLogger("collect-vercel");

export interface VercelFirewallEvent {
  action: string;   // "block" | "challenge" | "log"
  ip: string;
  path: string;
  timestamp: string;
}

export async function collectVercelFirewallEvents(): Promise<VercelFirewallEvent[]> {
  const { token, teamId, projectId } = securityConfig.vercel;

  if (!token || !teamId || !projectId) {
    log.warn("Vercel credentials not set — skipping Vercel collector (VERCEL_API_TOKEN / VERCEL_TEAM_ID / VERCEL_PROJECT_ID)");
    return [];
  }

  try {
    const res = await fetch(
      `https://api.vercel.com/v1/security/firewall/log?teamId=${teamId}&projectId=${projectId}&limit=100`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!res.ok) {
      log.warn("Vercel Firewall API error", { status: res.status });
      return [];
    }

    const body = await res.json() as { data?: VercelFirewallEvent[] };
    return body.data ?? [];
  } catch (err) {
    log.error("Vercel collector failed", { message: String(err) });
    return [];
  }
}
