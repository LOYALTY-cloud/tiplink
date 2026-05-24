/**
 * Collector: Supabase — reads security_events emitted by the app.
 * This is the primary feed for rules that analyze in-app behavior.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { SecurityEvent } from "../types/security-event";
import { createLogger } from "../utils/logger";

const log = createLogger("collect-supabase");

export interface CollectedEvents {
  events: SecurityEvent[];
  since: string;
}

/**
 * Pull all security_events from the last N minutes.
 * Called once per cron run; the rules engine fans out from here.
 */
export async function collectSupabaseEvents(windowMinutes: number): Promise<CollectedEvents> {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("security_events")
    .select("type, ip, user_id, route, metadata, occurred_at")
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(2000);

  if (error) {
    log.error("Failed to collect events", { message: error.message });
    return { events: [], since };
  }

  const events: SecurityEvent[] = (data ?? []).map((row) => ({
    type: row.type as SecurityEvent["type"],
    ip: row.ip ?? null,
    userId: row.user_id ?? null,
    route: row.route ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    occurredAt: row.occurred_at,
  }));

  log.info(`Collected ${events.length} events since ${since}`);
  return { events, since };
}
