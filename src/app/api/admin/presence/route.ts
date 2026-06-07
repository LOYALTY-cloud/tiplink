import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromSession } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

/**
 * POST — heartbeat ping from admin layout.
 * Updates last_active_at so isAdminOnline() can determine real presence.
 * Also increments active time on the current admin_session for payroll tracking.
 */
export async function POST(req: Request) {
  try {
    // Presence must be authenticated via a valid JWT only — legacy X-Admin-Id
    // header is intentionally excluded here to prevent stale/expired sessions
    // from keeping an admin's last_active_at artificially fresh.
    const authHeader = req.headers.get("authorization") ?? "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const admin = await getAdminFromSession(jwt);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date().toISOString();

    // Update profile presence
    await supabaseAdmin
      .from("profiles")
      .update({ last_active_at: now })
      .eq("user_id", admin.userId);

    // Increment active time on open work session
    const { data: session } = await supabaseAdmin
      .from("admin_sessions")
      .select("id, last_active_at, total_active_seconds")
      .eq("admin_id", admin.userId)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (session) {
      const diff = Math.floor(
        (Date.now() - new Date(session.last_active_at).getTime()) / 1000
      );
      // Only count if heartbeat gap ≤ 60s (skip idle gaps)
      const increment = diff > 60 ? 0 : diff;
      await supabaseAdmin
        .from("admin_sessions")
        .update({
          last_active_at: now,
          total_active_seconds: session.total_active_seconds + increment,
        })
        .eq("id", session.id);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
