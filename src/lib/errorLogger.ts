import { supabaseAdmin } from "@/lib/supabase/admin";

type ErrorSeverity = "warning" | "error" | "critical";

type ErrorLogEntry = {
  source: string;         // e.g. "api/payments/create", "stripe/webhook"
  message: string;
  severity?: ErrorSeverity;
  stack?: string;
  metadata?: Record<string, unknown>;
  userId?: string;
  ip?: string;
};

/**
 * Log an error to the error_logs table.
 * Fire-and-forget — never throws, never blocks the request.
 *
 * Usage:
 *   logError({ source: "api/payments/create", message: "Stripe failed", severity: "critical", metadata: { stripeError } });
 */
export async function logError(entry: ErrorLogEntry): Promise<void> {
  try {
    // Also log to console for immediate visibility
    const tag = `[${entry.severity ?? "error"}] [${entry.source}]`;
    console.error(tag, entry.message, entry.metadata ?? "");

    await supabaseAdmin.from("error_logs").insert({
      source: entry.source,
      severity: entry.severity ?? "error",
      message: entry.message.slice(0, 2000),
      stack: entry.stack?.slice(0, 5000) ?? null,
      metadata: entry.metadata ?? {},
      user_id: entry.userId ?? null,
      ip_address: entry.ip ?? null,
    });
  } catch {
    // Last resort — never crash on logging failure
    console.error("[logError] failed to persist error:", entry.message);
  }
}

/**
 * Convenience: log a caught Error object.
 */
export function logCaughtError(source: string, err: unknown, extra?: Partial<ErrorLogEntry>): void {
  const e = err instanceof Error ? err : new Error(String(err));
  logError({
    source,
    message: e.message,
    stack: e.stack,
    severity: "error",
    ...extra,
  });
}
