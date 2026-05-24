import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { trackLogin, generateDeviceHash, isNewDevice } from "@/lib/loginTracker";
import { checkDevice } from "@/lib/deviceRecognition";
import { sendNewDeviceEmail } from "@/lib/email/sendNewDeviceAlert";
import { createNotification } from "@/lib/notifications";
import { emitSecurityEvent } from "@/lib/security-event";

export const runtime = "nodejs";

/** Redirect browser GET requests to the login page */
export function GET(req: Request) {
  const { origin } = new URL(req.url);
  return NextResponse.redirect(`${origin}/login`, 302);
}

/**
 * POST /api/auth/login
 * Server-side login with per-email rate limiting + failed attempt tracking.
 * Replaces client-side signInWithPassword for security.
 */
export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || typeof email !== "string" || !password || typeof password !== "string") {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const ip = getClientIp(req);

    // ── Rate limit: per-IP (500 attempts / 15 min) ───────────────────
    // High threshold — IP is a poor key on shared infrastructure (Vercel,
    // corporate NAT, etc.) where many users share one IP. This is only a
    // last-resort DDoS backstop; per-email is the real brute-force control.
    const ipLimit = await rateLimit(`login_ip:${ip}`, 500, 900);
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        { status: 429 }
      );
    }

    // ── Rate limit: per-email (5 attempts / 15 min) ──────────────────
    const emailLimit = await rateLimit(`login_email:${normalizedEmail}`, 5, 900);
    if (!emailLimit.allowed) {
      return NextResponse.json(
        { error: "Too many login attempts for this account. Please try again later." },
        { status: 429 }
      );
    }

    // ── Attempt sign-in via Supabase Admin (server-side) ─────────────
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error || !data.session) {
      // Track failed attempt (fire-and-forget)
      trackLogin({
        userId: normalizedEmail, // best effort — no user_id on failure
        eventType: "login",
        ip,
        userAgent: req.headers.get("user-agent") || "",
        deviceHash: generateDeviceHash(ip, req.headers.get("user-agent") || ""),
        success: false,
        failureReason: "invalid_credentials",
      }).catch(() => {});

      // Generic error — never reveal whether email exists
      emitSecurityEvent({ type: "LOGIN_FAILURE", ip, route: "/api/auth/login" });
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // ── Success — track login + smart device recognition ────────
    const userAgent = req.headers.get("user-agent") || "";
    const deviceHash = generateDeviceHash(ip, userAgent);

    // Smart device check: trusted_devices table + fuzzy match + 24h cooldown
    const device = await checkDevice(data.user.id, userAgent, ip);

    trackLogin({
      userId: data.user.id,
      eventType: "login",
      ip,
      userAgent,
      deviceHash,
      success: true,
    }).catch(() => {});

    emitSecurityEvent({ type: "LOGIN_SUCCESS", ip, userId: data.user.id, route: "/api/auth/login" });

    // New device detected — send email + in-app notification (fire-and-forget)
    if (device.shouldAlert) {
      const timeLabel = new Date().toLocaleString("en-US", {
        month: "short", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit", timeZoneName: "short",
      });

      sendNewDeviceEmail({
        to: data.user.email!,
        device: device.label,
        ip,
        time: timeLabel,
      }).catch(() => {});

      createNotification({
        userId: data.user.id,
        type: "security",
        title: "New device login detected",
        body: `Login from ${device.label} (${ip})`,
        meta: { action: "new_device_login", device: device.label, ip },
      }).catch(() => {});
    }

    const res = NextResponse.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });

    // Write the session cookie directly — avoids the extra GET /user network
    // call that supabaseSsr.auth.setSession() makes internally before it writes
    // cookies. If that call is slow or fails, no cookies get set and the
    // middleware rejects the next /dashboard request.
    //
    // Format matches exactly what @supabase/ssr writes:
    //   "base64-" + base64url(JSON.stringify(session))
    // The getSessionUser() function in proxy.ts decodes this same format.
    const sessionPayload = JSON.stringify({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      token_type: "bearer",
    });
    const cookieValue = "base64-" + Buffer.from(sessionPayload, "utf-8").toString("base64url");

    // Clear any stale session chunks from a previous login before setting new one
    const existingCookieNames = (req.headers.get("cookie") ?? "")
      .split(";")
      .map((c) => c.slice(0, c.indexOf("=")).trim())
      .filter((n) => n.startsWith("supabase.auth.token"));

    for (const stale of existingCookieNames) {
      res.cookies.set(stale, "", { path: "/", maxAge: 0, sameSite: "lax" });
    }

    res.cookies.set("supabase.auth.token", cookieValue, {
      path: "/",
      maxAge: 400 * 24 * 60 * 60, // 400 days — matches @supabase/ssr default
      sameSite: "lax",
      httpOnly: false,             // must be readable by client JS
    });

    return res;
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
