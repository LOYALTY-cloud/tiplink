import { supabaseAdmin } from "@/lib/supabase/admin";
import crypto from "crypto";

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
 * Generate a stable device fingerprint from User-Agent only.
 * IP is excluded because it changes frequently (mobile, ISP rotation, VPN)
 * and would cause false "new device" alerts on every login.
 */
export function generateDeviceHash(ip: string, userAgent: string): string {
  return crypto
    .createHash("sha256")
    .update(userAgent)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Parse a User-Agent string into a human-readable device label.
 */
export function parseDeviceLabel(ua: string): string {
  let browser = "Unknown browser";
  let os = "Unknown OS";

  if (/edg/i.test(ua)) browser = "Edge";
  else if (/chrome/i.test(ua) && !/chromium/i.test(ua)) browser = "Chrome";
  else if (/firefox/i.test(ua)) browser = "Firefox";
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = "Safari";
  else if (/opera|opr/i.test(ua)) browser = "Opera";

  if (/windows/i.test(ua)) os = "Windows";
  else if (/macintosh|mac os/i.test(ua)) os = "macOS";
  else if (/android/i.test(ua)) os = "Android";
  else if (/iphone|ipad/i.test(ua)) os = "iOS";
  else if (/linux/i.test(ua)) os = "Linux";

  return `${browser} on ${os}`;
}

/**
 * Check if this device hash has been seen before for this user.
 * Returns true if this is the first time.
 */
export async function isNewDevice(
  userId: string,
  deviceHash: string
): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from("login_logs")
      .select("id")
      .eq("user_id", userId)
      .eq("device_hash", deviceHash)
      .eq("success", true)
      .limit(1);

    if (error) return false; // fail safe — don't send false alerts
    return !data || data.length === 0;
  } catch {
    return false;
  }
}

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
