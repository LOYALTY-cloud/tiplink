import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

/**
 * POST /api/admin/verify-passcode
 *
 * Verifies the admin's passcode against the stored value without issuing a
 * new session. Used exclusively by the AdminLockScreen to re-authenticate
 * after an idle/tab-switch lock.
 *
 * Requires an existing valid admin JWT (Authorization: Bearer <token>).
 * Body: { passcode: string }
 */
export async function POST(req: Request) {
  try {
    // Must already have a valid admin session — we're re-verifying, not logging in.
    const session = await getAdminFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Per-user rate limit: 10 attempts / 10 minutes
    const { allowed } = await rateLimit(`admin-verify-passcode:${session.userId}`, 10, 600);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Wait 10 minutes before trying again." },
        { status: 429 }
      );
    }

    const ip = getClientIp(req);
    // Also limit by IP to prevent distributed attacks
    const { allowed: ipAllowed } = await rateLimit(`admin-verify-passcode-ip:${ip}`, 40, 600);
    if (!ipAllowed) {
      return NextResponse.json(
        { error: "Too many attempts from this network." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const passcode = String(body?.passcode ?? "").trim().toUpperCase();

    if (!passcode) {
      return NextResponse.json({ error: "Passcode is required" }, { status: 400 });
    }

    // Look up the admin's stored passcode
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("admin_passcode, is_active")
      .eq("user_id", session.userId)
      .maybeSingle();

    if (!profile || !profile.admin_passcode) {
      return NextResponse.json({ error: "Invalid passcode" }, { status: 401 });
    }

    if (profile.is_active === false) {
      return NextResponse.json({ error: "Account deactivated" }, { status: 403 });
    }

    if (profile.admin_passcode !== passcode) {
      return NextResponse.json({ error: "Invalid passcode" }, { status: 401 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
