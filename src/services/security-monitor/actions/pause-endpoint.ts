/**
 * Action: Pause Endpoint — inserts a kill-switch for a route.
 * Also exports isEndpointPaused() for use in route handlers.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { securityConfig } from "../config/security-config";
import type { ActionResult } from "../types/security-event";
import { createLogger } from "../utils/logger";

const log = createLogger("pause-endpoint");

export async function pauseEndpoint(
  route: string,
  reason: string,
  durationMinutes: number = 30
): Promise<ActionResult> {
  if (securityConfig.mode === "observe") {
    log.info(`[observe] Would pause endpoint ${route} for ${durationMinutes} min`);
    return { type: "PAUSE_ENDPOINT", target: route, result: "SKIPPED", detail: "observe mode" };
  }

  const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();

  const { error } = await supabaseAdmin
    .from("security_paused_endpoints")
    .upsert(
      { route, reason, expires_at: expiresAt, paused: true },
      { onConflict: "route" }
    );

  if (error) {
    log.error("DB upsert failed for pause-endpoint", { message: error.message });
    return { type: "PAUSE_ENDPOINT", target: route, result: "FAILED", detail: error.message };
  }

  log.warn(`Endpoint paused`, { route, durationMinutes });
  return { type: "PAUSE_ENDPOINT", target: route, result: "OK", detail: `${durationMinutes} min` };
}

/**
 * Check if a route is currently paused.
 * Call this in route handlers as a kill-switch check.
 * Returns false on any DB error (fail-open — prefer availability).
 */
export async function isEndpointPaused(route: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from("security_paused_endpoints")
      .select("paused, expires_at")
      .eq("route", route)
      .eq("paused", true)
      .maybeSingle();

    if (error || !data) return false;
    if (!data.expires_at) return data.paused;
    return new Date(data.expires_at) > new Date();
  } catch {
    return false;
  }
}
