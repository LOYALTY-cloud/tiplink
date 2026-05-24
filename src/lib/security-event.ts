/**
 * emitSecurityEvent — bridge between app routes and the security monitor.
 *
 * Import this file in app routes. Never import from the monitor package directly.
 * Fire-and-forget: never blocks the request, never throws.
 *
 * Usage:
 *   import { emitSecurityEvent } from "@/lib/security-event";
 *   emitSecurityEvent({ type: "LOGIN_FAILURE", ip, userId });
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { SecurityEvent } from "@/services/security-monitor/types/security-event";

export type { SecurityEvent };

export function emitSecurityEvent(event: SecurityEvent): void {
  if (process.env.AI_SECURITY_MONITOR !== "true") return;

  // Fire and forget — do not await, do not block the request
  void (async () => {
    try {
      await supabaseAdmin
        .from("security_events")
        .insert({
          type:        event.type,
          ip:          event.ip ?? null,
          user_id:     event.userId ?? null,
          route:       event.route ?? null,
          metadata:    event.metadata ?? {},
          occurred_at: event.occurredAt ?? new Date().toISOString(),
        });
    } catch (err) {
      console.error("[emitSecurityEvent] insert failed:", err instanceof Error ? err.message : String(err));
    }
  })();
}
