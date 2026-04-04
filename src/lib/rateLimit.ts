import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Atomic rate limiter backed by Supabase RPC.
 * Uses INSERT ... ON CONFLICT in a single SQL call — no race conditions.
 *
 * @param key   Unique key, e.g. "signup:192.168.1.1" or "pay:user-uuid"
 * @param limit Max requests allowed in the window
 * @param windowSec Window duration in seconds
 * @returns { allowed: boolean }
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number
): Promise<{ allowed: boolean }> {
  const { data, error } = await supabaseAdmin.rpc("check_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_sec: windowSec,
  });

  if (error) {
    // Fail open — don't block legitimate users if the rate limit table is down
    console.error("rateLimit RPC error:", error.message);
    return { allowed: true };
  }

  return { allowed: Boolean(data) };
}

/** Extract client IP from request headers (Vercel / Cloudflare compatible) */
export function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}
