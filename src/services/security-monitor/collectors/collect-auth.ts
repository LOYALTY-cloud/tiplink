/**
 * Collector: Auth — scoped view of login / session events.
 * Pulls from security_events filtered to auth-related types.
 */

import type { SecurityEvent } from "../types/security-event";

export interface AuthEventSummary {
  totalFailures: number;
  failuresByIp: Record<string, number>;
  successByIp: Record<string, number>;
  uniqueTargetedIps: number;
}

const AUTH_FAILURE_TYPES = new Set([
  "LOGIN_FAILURE",
  "TWO_FA_FAILURE",
]);

/**
 * Summarise auth events from an already-collected event batch.
 * No extra DB call needed — the supabase collector provides the data.
 */
export function summariseAuthEvents(events: SecurityEvent[]): AuthEventSummary {
  const failuresByIp: Record<string, number> = {};
  const successByIp: Record<string, number> = {};
  let totalFailures = 0;

  for (const e of events) {
    const ip = e.ip ?? "unknown";
    if (AUTH_FAILURE_TYPES.has(e.type)) {
      failuresByIp[ip] = (failuresByIp[ip] ?? 0) + 1;
      totalFailures++;
    }
    if (e.type === "LOGIN_SUCCESS") {
      successByIp[ip] = (successByIp[ip] ?? 0) + 1;
    }
  }

  return {
    totalFailures,
    failuresByIp,
    successByIp,
    uniqueTargetedIps: Object.keys(failuresByIp).length,
  };
}
