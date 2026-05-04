import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { trackLogin } from "@/lib/loginTracker";
import { getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

/**
 * POST /api/auth/track-login
 * Fire-and-forget endpoint called client-side after successful signIn.
 * Records the device/IP in login_logs for the security panel.
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { data: authData, error: authError } =
    await supabaseAdmin.auth.getUser(token);
  if (authError || !authData?.user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") || "";

  await trackLogin({
    userId: authData.user.id,
    eventType: "login",
    ip,
    userAgent,
    success: true,
  });

  return NextResponse.json({ ok: true });
}
