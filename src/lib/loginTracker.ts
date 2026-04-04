import { supabaseAdmin } from "@/lib/supabase/admin";

type LoginEvent = {
  userId: string;
  eventType: "login" | "signup" | "password_reset" | "logout";
  ip: string;
  userAgent: string;
  deviceHash?: string;
  success: boolean;
  failureReason?: string;
};

/**
 * Record a login/auth event for fraud analytics.
 * Fire-and-forget — never blocks the auth flow.
 */
export async function trackLogin(event: LoginEvent): Promise<void> {
  try {
    await supabaseAdmin.from("login_logs").insert({
      user_id: event.userId,
      event_type: event.eventType,
      ip_address: event.ip,
      user_agent: event.userAgent,
      device_hash: event.deviceHash || null,
      success: event.success,
      failure_reason: event.failureReason || null,
    });
  } catch (err) {
    // Never throw — this is telemetry, not critical path
    console.error("[trackLogin] failed:", err);
  }
}

/**
 * Check if a user has suspicious login patterns (many IPs/devices in short window).
 * Returns true if suspicious.
 */
export async function hasSuspiciousLogins(
  userId: string,
  windowHours = 1,
  ipThreshold = 3,
  deviceThreshold = 3,
): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.rpc("check_suspicious_logins", {
      p_user_id: userId,
      p_window_hours: windowHours,
    });
    if (error || !data?.[0]) return false;
    const row = data[0] as { distinct_ips: number; distinct_devices: number };
    return row.distinct_ips >= ipThreshold || row.distinct_devices >= deviceThreshold;
  } catch {
    return false;
  }
}
