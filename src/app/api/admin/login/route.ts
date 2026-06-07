import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { trackLogin } from "@/lib/loginTracker";
import { signAdminToken } from "@/lib/auth/adminJwt";
import { emitSecurityEvent } from "@/lib/security-event";
import { ADMIN_ROLES } from "@/lib/auth/permissions";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    // Rate limit: per-IP backstop (high threshold — shared infra)
    const ip = getClientIp(req);
    const { allowed: ipAllowed } = await rateLimit(`admin-login-ip:${ip}`, 200, 900);
    if (!ipAllowed) {
      return NextResponse.json({ error: "Too many login attempts. Try again later." }, { status: 429 });
    }

    const { firstName, lastName, passcode } = await req.json();

    if (!firstName?.trim() || !lastName?.trim() || !passcode?.trim()) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }

    const fn = firstName.trim().toLowerCase();
    const ln = lastName.trim().toLowerCase();
    const code = passcode.trim().toUpperCase();

    // Per-passcode rate limit: 5 attempts / 15 min (brute-force protection)
    const { allowed: codeAllowed } = await rateLimit(`admin-login-code:${code}`, 5, 900);
    if (!codeAllowed) {
      return NextResponse.json({ error: "Too many login attempts for this account. Try again later." }, { status: 429 });
    }

    // Look up profile by admin_passcode
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("user_id, first_name, last_name, display_name, role, admin_id, admin_passcode, email, is_active, invite_status")
      .eq("admin_passcode", code)
      .maybeSingle();

    if (error || !profile) {
      trackLogin({ userId: "unknown", eventType: "login", ip, userAgent: req.headers.get("user-agent") || "", success: false, failureReason: "invalid_credentials" });
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Verify name matches (case-insensitive)
    const dbFirst = (profile.first_name ?? "").toLowerCase();
    const dbLast = (profile.last_name ?? "").toLowerCase();
    if (dbFirst !== fn || dbLast !== ln) {
      trackLogin({ userId: "unknown", eventType: "login", ip, userAgent: req.headers.get("user-agent") || "", success: false, failureReason: "name_mismatch" });
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Verify admin role
    if (!profile.role || !ADMIN_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Check if admin account is deactivated
    if (profile.is_active === false) {
      return NextResponse.json({ error: "Account deactivated. Contact the owner." }, { status: 403 });
    }

    // Check admins table status (suspended / terminated / restricted)
    const { data: adminRow } = await supabaseAdmin
      .from("admins")
      .select("status, restricted_until")
      .eq("user_id", profile.user_id)
      .maybeSingle();

    if (adminRow) {
      if (adminRow.status === "terminated") {
        return NextResponse.json({ error: "Your admin access has been permanently revoked." }, { status: 403 });
      }
      if (adminRow.status === "suspended") {
        return NextResponse.json({ error: "Your admin account is suspended. Contact the owner." }, { status: 403 });
      }
    }

    // Update last_login_at (upsert handles admins created without a row)
    await supabaseAdmin
      .from("admins")
      .upsert({ user_id: profile.user_id, last_login_at: new Date().toISOString() }, { onConflict: "user_id" })
      .then(() => {}, () => {});

    // Mark invite as accepted on first login
    if (profile.invite_status === "pending") {
      await supabaseAdmin.from("profiles").update({ invite_status: "accepted" }).eq("admin_passcode", code).then(() => {}, () => {});
    }

    // Update last_active_at on login + set online
    await supabaseAdmin
      .from("profiles")
      .update({ last_active_at: new Date().toISOString(), availability: "online" })
      .eq("admin_passcode", code)
      .then(() => {}, () => {});

    // Log the login
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: profile.user_id,
      action: "admin_login",
      severity: "info",
      metadata: {
        display_name: profile.display_name,
        admin_id_used: profile.admin_id,
      },
    }).then(() => {}, () => {});

    // Track login for fraud analytics
    trackLogin({ userId: profile.user_id, eventType: "login", ip, userAgent: req.headers.get("user-agent") || "", success: true });
    emitSecurityEvent({ type: "ADMIN_ACCESS", ip, userId: profile.user_id, route: "/api/admin/login", metadata: { role: profile.role } });

    // Issue signed JWT with 8-hour server-enforced expiry
    const adminName = profile.first_name && profile.last_name
      ? `${profile.first_name} ${profile.last_name}`
      : profile.display_name || `${firstName.trim()} ${lastName.trim()}`;

    const token = await signAdminToken({
      sub: profile.user_id,
      role: profile.role,
      admin_id: profile.admin_id,
      name: adminName,
    });

    const response = NextResponse.json({
      ok: true,
      token,
      session: {
        id: profile.user_id,
        name: adminName,
        role: profile.role,
        admin_id: profile.admin_id,
      },
    });

    // Set HTTP-only cookie so middleware can verify admin sessions server-side.
    // The token is also returned in the JSON body for use in Authorization headers.
    const isSecure = (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https");
    response.cookies.set("admin_jwt", token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      maxAge: 8 * 60 * 60, // 8 hours — matches JWT expiry
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
