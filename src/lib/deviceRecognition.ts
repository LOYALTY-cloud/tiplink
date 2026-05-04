/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║        1neLink — Device Recognition Service                  ║
 * ║                                                              ║
 * ║  Smart "new device" detection that doesn't spam users.       ║
 * ║  Matches real fintech behavior (Stripe, PayPal, etc.)        ║
 * ╚═══════════════════════════════════════════════════════════════╝
 *
 * Decision matrix:
 *   Same device_hash   → Update last_used_at, NO email
 *   Same browser + OS  → Likely same device, NO email
 *   New browser OR OS  → SEND email (unless cooldown active)
 *   24h cooldown       → Skip email even for truly new device
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import crypto from "crypto";

/* ═══════════════════════════════════════════════════════════════
   1.  FINGERPRINTING
   ═══════════════════════════════════════════════════════════════ */

/**
 * Generate a stable device hash from User-Agent.
 * IP is intentionally excluded — it changes constantly on mobile
 * networks and would cause false "new device" alerts.
 */
export function hashDevice(userAgent: string): string {
  return crypto
    .createHash("sha256")
    .update(userAgent)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Extract browser family from User-Agent.
 * Returns a stable string like "Chrome", "Safari", "Firefox".
 */
export function parseBrowserFamily(ua: string): string {
  if (/edg/i.test(ua)) return "Edge";
  if (/opr|opera/i.test(ua)) return "Opera";
  if (/firefox/i.test(ua)) return "Firefox";
  if (/chrome/i.test(ua) && !/chromium/i.test(ua)) return "Chrome";
  if (/safari/i.test(ua) && !/chrome/i.test(ua)) return "Safari";
  return "Other";
}

/**
 * Extract OS family from User-Agent.
 */
export function parseOsFamily(ua: string): string {
  if (/iphone|ipad/i.test(ua)) return "iOS";
  if (/android/i.test(ua)) return "Android";
  if (/windows/i.test(ua)) return "Windows";
  if (/macintosh|mac os/i.test(ua)) return "macOS";
  if (/linux/i.test(ua)) return "Linux";
  return "Other";
}

/**
 * Build human-readable device label: "Chrome on macOS"
 */
export function deviceLabel(ua: string): string {
  return `${parseBrowserFamily(ua)} on ${parseOsFamily(ua)}`;
}

/* ═══════════════════════════════════════════════════════════════
   2.  RECOGNITION ENGINE
   ═══════════════════════════════════════════════════════════════ */

export interface DeviceCheckResult {
  /** Should a "new device" email be sent? */
  shouldAlert: boolean;
  /** Why or why not */
  reason:
    | "known_device"        // exact hash match
    | "same_browser_os"     // same browser+OS family (fuzzy match)
    | "cooldown_active"     // new device, but alert sent <24h ago
    | "new_device"          // genuinely new — send the email
    | "first_login";        // very first login ever (signup) — skip
  /** Device hash for tracking */
  deviceHash: string;
  /** Human-readable label */
  label: string;
}

const COOLDOWN_HOURS = 24;

/**
 * Core decision: should we alert this user about this device?
 *
 * 1. Exact hash match in trusted_devices → known, update last_used
 * 2. Same browser + OS family exists → fuzzy match, trust it
 * 3. 24h cooldown active → suppress email
 * 4. Otherwise → new device, send alert
 */
export async function checkDevice(
  userId: string,
  userAgent: string,
  ip: string,
): Promise<DeviceCheckResult> {
  const dHash = hashDevice(userAgent);
  const browser = parseBrowserFamily(userAgent);
  const os = parseOsFamily(userAgent);
  const label = `${browser} on ${os}`;

  try {
    // ── Step 1: Exact device_hash match ───────────────────────────
    const { data: exact } = await supabaseAdmin
      .from("trusted_devices")
      .select("id")
      .eq("user_id", userId)
      .eq("device_hash", dHash)
      .limit(1)
      .maybeSingle();

    if (exact) {
      // Known device — just update timestamps
      await supabaseAdmin
        .from("trusted_devices")
        .update({ last_used_at: new Date().toISOString(), last_ip: ip })
        .eq("user_id", userId)
        .eq("device_hash", dHash);

      return { shouldAlert: false, reason: "known_device", deviceHash: dHash, label };
    }

    // ── Step 2: Check if user has ANY trusted devices ─────────────
    // (if none, this is their first login — don't alert on signup device)
    const { count } = await supabaseAdmin
      .from("trusted_devices")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    if (!count || count === 0) {
      // First device ever — trust it silently
      await trustDevice(userId, dHash, label, browser, os, ip);
      return { shouldAlert: false, reason: "first_login", deviceHash: dHash, label };
    }

    // ── Step 3: Fuzzy match — same browser + OS family ────────────
    const { data: fuzzy } = await supabaseAdmin
      .from("trusted_devices")
      .select("id")
      .eq("user_id", userId)
      .eq("browser_family", browser)
      .eq("os_family", os)
      .limit(1)
      .maybeSingle();

    if (fuzzy) {
      // Same browser+OS, just different UA version — trust it
      await trustDevice(userId, dHash, label, browser, os, ip);
      return { shouldAlert: false, reason: "same_browser_os", deviceHash: dHash, label };
    }

    // ── Step 4: Cooldown — was an alert sent recently? ────────────
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("last_device_alert_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (profile?.last_device_alert_at) {
      const lastAlert = new Date(profile.last_device_alert_at).getTime();
      const hoursSince = (Date.now() - lastAlert) / (1000 * 60 * 60);
      if (hoursSince < COOLDOWN_HOURS) {
        // Still in cooldown — save device but skip email
        await trustDevice(userId, dHash, label, browser, os, ip);
        return { shouldAlert: false, reason: "cooldown_active", deviceHash: dHash, label };
      }
    }

    // ── Step 5: Genuinely new device — alert! ─────────────────────
    await trustDevice(userId, dHash, label, browser, os, ip);

    // Update cooldown timestamp
    await supabaseAdmin
      .from("profiles")
      .update({ last_device_alert_at: new Date().toISOString() })
      .eq("user_id", userId);

    return { shouldAlert: true, reason: "new_device", deviceHash: dHash, label };
  } catch (err) {
    // Fail safe — never send false alerts if something breaks
    console.error("[checkDevice] error:", err);
    return { shouldAlert: false, reason: "known_device", deviceHash: dHash, label };
  }
}

/* ═══════════════════════════════════════════════════════════════
   3.  TRUST A DEVICE
   ═══════════════════════════════════════════════════════════════ */

async function trustDevice(
  userId: string,
  dHash: string,
  label: string,
  browser: string,
  os: string,
  ip: string,
): Promise<void> {
  await supabaseAdmin
    .from("trusted_devices")
    .upsert(
      {
        user_id: userId,
        device_hash: dHash,
        device_label: label,
        browser_family: browser,
        os_family: os,
        ip_address: ip,
        last_ip: ip,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "user_id,device_hash" },
    )
    .then(() => {}, (err) => console.error("[trustDevice] upsert failed:", err));
}

/* ═══════════════════════════════════════════════════════════════
   4.  AUTO-TRUST ON SIGNUP (call from signup route)
   ═══════════════════════════════════════════════════════════════ */

/**
 * Call after successful signup to pre-trust the signup device.
 * This prevents a "new device" alert on the user's very first login.
 */
export async function trustSignupDevice(
  userId: string,
  userAgent: string,
  ip: string,
): Promise<void> {
  const dHash = hashDevice(userAgent);
  const browser = parseBrowserFamily(userAgent);
  const os = parseOsFamily(userAgent);
  const label = `${browser} on ${os}`;
  await trustDevice(userId, dHash, label, browser, os, ip);
}
