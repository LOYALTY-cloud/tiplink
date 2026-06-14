import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

/**
 * POST /api/admin/workforce/end-shift
 * Closes the active admin session (with final time increment) and
 * clears the admin_jwt cookie in one atomic step, so the browser
 * is fully logged out after a single fetch call.
 */
export async function POST(req: Request) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();

    // Close any open session with a final active-time increment
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
        (now.getTime() - new Date(session.last_active_at).getTime()) / 1000
      );
      const increment = diff > 60 ? 0 : diff;

      await supabaseAdmin
        .from("admin_sessions")
        .update({
          ended_at: now.toISOString(),
          last_active_at: now.toISOString(),
          total_active_seconds: session.total_active_seconds + increment,
        })
        .eq("id", session.id);
    }

    // Clear the JWT cookie (same as /api/admin/logout)
    const res = NextResponse.json({ ok: true, clocked_out_at: now.toISOString() });
    res.cookies.set("admin_jwt", "", {
      httpOnly: true,
      secure: (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https"),
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Failed to end shift" }, { status: 500 });
  }
}
