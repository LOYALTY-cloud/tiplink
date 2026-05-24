/**
 * Action: Revoke Session — signs out a user from all devices.
 * In observe mode, logs intent but does NOT revoke.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { securityConfig } from "../config/security-config";
import type { ActionResult } from "../types/security-event";
import { createLogger } from "../utils/logger";

const log = createLogger("revoke-session");

export async function revokeSession(userId: string, reason: string): Promise<ActionResult> {
  if (securityConfig.mode === "observe") {
    log.info(`[observe] Would revoke session for ${userId.slice(0, 8)}*** — skipping`);
    return { type: "REVOKE_SESSION", target: userId.slice(0, 8) + "***", result: "SKIPPED", detail: "observe mode" };
  }

  try {
    const { error } = await supabaseAdmin.auth.admin.signOut(userId, "global");
    if (error) {
      log.error("signOut failed", { message: error.message });
      return { type: "REVOKE_SESSION", target: userId.slice(0, 8) + "***", result: "FAILED", detail: error.message };
    }

    log.info(`Session revoked`, { reason });
    return { type: "REVOKE_SESSION", target: userId.slice(0, 8) + "***", result: "OK", detail: reason };
  } catch (err) {
    log.error("revokeSession threw", { message: String(err) });
    return { type: "REVOKE_SESSION", target: userId.slice(0, 8) + "***", result: "FAILED", detail: String(err) };
  }
}
