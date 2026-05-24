/**
 * Action: Tighten Rate Limit — inserts monitor-owned rate limit overrides.
 * These are read by the rate limiter middleware (if integrated).
 * In observe mode, logs intent only.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { securityConfig } from "../config/security-config";
import type { ActionResult } from "../types/security-event";
import { createLogger } from "../utils/logger";

const log = createLogger("tighten-rate-limit");

export async function tightenRateLimit(
  ip: string,
  maxRequests: number = 10,
  windowSeconds: number = 60,
  reason: string = "security-monitor"
): Promise<ActionResult> {
  if (securityConfig.mode === "observe") {
    log.info(`[observe] Would tighten rate limit for ${ip} to ${maxRequests} req/${windowSeconds}s`);
    return { type: "TIGHTEN_RATE_LIMIT", target: ip, result: "SKIPPED", detail: "observe mode" };
  }

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1-hour override

  const { error } = await supabaseAdmin
    .from("security_rate_limits")
    .upsert(
      {
        ip,
        max_requests: maxRequests,
        window_seconds: windowSeconds,
        reason,
        expires_at: expiresAt,
      },
      { onConflict: "ip" }
    );

  if (error) {
    log.error("DB upsert failed for tighten-rate-limit", { message: error.message });
    return { type: "TIGHTEN_RATE_LIMIT", target: ip, result: "FAILED", detail: error.message };
  }

  log.info(`Rate limit tightened`, { ip: ip.slice(0, 12), maxRequests, windowSeconds });
  return { type: "TIGHTEN_RATE_LIMIT", target: ip, result: "OK", detail: `${maxRequests} req/${windowSeconds}s` };
}
