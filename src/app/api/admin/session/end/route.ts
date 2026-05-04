import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * POST — End the active work session for an admin.
 * Called via sendBeacon on logout / tab close, so we parse admin_id
 * from the JSON body (no JWT available in beacon requests).
 */
export async function POST(req: Request) {
  try {
    const { admin_id } = await req.json();
    if (!admin_id || typeof admin_id !== "string") {
      return NextResponse.json({ error: "Missing admin_id" }, { status: 400 });
    }

    const { data: session } = await supabaseAdmin
      .from("admin_sessions")
      .select("id, last_active_at, total_active_seconds")
      .eq("admin_id", admin_id)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!session) {
      return NextResponse.json({ ok: true });
    }

    // Final active-time increment
    const now = new Date();
    const last = new Date(session.last_active_at);
    const diff = Math.floor((now.getTime() - last.getTime()) / 1000);
    const increment = diff > 60 ? 0 : diff;

    await supabaseAdmin
      .from("admin_sessions")
      .update({
        ended_at: now.toISOString(),
        last_active_at: now.toISOString(),
        total_active_seconds: session.total_active_seconds + increment,
      })
      .eq("id", session.id);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
