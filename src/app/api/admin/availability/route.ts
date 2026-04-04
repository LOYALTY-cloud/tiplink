import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest, getAdminFromSession } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

/**
 * POST — heartbeat from admin layout OR explicit offline on logout.
 * Automatically determines online/busy based on active support sessions.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { availability, _admin_id, heartbeat } = body;

    // Support sendBeacon (no headers) via _admin_id in body
    let admin = await getAdminFromRequest(req);
    if (!admin && _admin_id) {
      admin = await getAdminFromSession(null, _admin_id);
    }
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Explicit offline (e.g. logout)
    if (availability === "offline") {
      await supabaseAdmin
        .from("profiles")
        .update({ availability: "offline" })
        .eq("user_id", admin.userId);
      return NextResponse.json({ ok: true, availability: "offline" });
    }

    // Heartbeat: determine status from active sessions
    if (heartbeat) {
      const { count } = await supabaseAdmin
        .from("support_sessions")
        .select("id", { count: "exact", head: true })
        .eq("assigned_admin_id", admin.userId)
        .eq("status", "active");

      const status = (count ?? 0) > 0 ? "busy" : "online";

      await supabaseAdmin
        .from("profiles")
        .update({ availability: status, last_active_at: new Date().toISOString() })
        .eq("user_id", admin.userId);

      return NextResponse.json({ ok: true, availability: status });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
