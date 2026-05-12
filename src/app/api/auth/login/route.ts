import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { trackLogin, generateDeviceHash, isNewDevice } from "@/lib/loginTracker";
import { checkDevice } from "@/lib/deviceRecognition";
import { sendNewDeviceEmail } from "@/lib/email/sendNewDeviceAlert";
import { createNotification } from "@/lib/notifications";

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

    // Set auth cookies so middleware can read the session.
    // Pass request cookies to getAll() so the SSR client can discover and
    // clear any stale session chunks from a previous login — otherwise the
    // old chunks stay in the browser and confuse the middleware on the next
    // request, triggering an invalid refresh-token error.
    const existingCookies = (req.headers.get("cookie") ?? "")
      .split(";")
      .flatMap<{ name: string; value: string }>((c) => {
        const eq = c.indexOf("=");
        if (eq < 0) return [];
        return [{ name: c.slice(0, eq).trim(), value: c.slice(eq + 1).trim() }];
      });

    const res = NextResponse.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });

    const supabaseSsr = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return existingCookies;
          },
          setAll(cookiesToSet) {
            for (const { name, value, options } of cookiesToSet) {
              res.cookies.set(name, value, options);
            }
          },
        },
      }
    );

    await supabaseSsr.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });

    return res;
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
