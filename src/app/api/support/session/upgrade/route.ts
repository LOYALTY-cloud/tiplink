import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { assignBestAdmin } from "@/lib/support/autoAssign";

export const runtime = "nodejs";

/**
 * Upgrade a support session from AI mode to human mode.
 * Tries to auto-assign an available admin.
 */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    let userId: string | null = null;
    if (token) {
      const { data, error } = await supabaseAdmin.auth.getUser(token);
      if (!error && data?.user) userId = data.user.id;
    }

    const { sessionId } = await req.json();
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }

    // Verify session exists and is in AI mode
    const { data: session } = await supabaseAdmin
      .from("support_sessions")
      .select("id, mode, status, user_id, priority")
      .eq("id", sessionId)
      .maybeSingle();

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Ownership check: if session has a user_id, requester must match
    if (session.user_id && userId && session.user_id !== userId) {
      return NextResponse.json({ error: "Not your session" }, { status: 403 });
    }

    if (session.mode === "human") {
      return NextResponse.json({ ok: true, mode: "human", assigned: null });
    }

    // Try to assign an admin
    const assigned = await assignBestAdmin(sessionId, { priority: session.priority ?? 0 });

    if (assigned) {
      // Upgrade mode to human
      await supabaseAdmin
        .from("support_sessions")
        .update({ mode: "human" })
        .eq("id", sessionId);

      await supabaseAdmin.from("support_messages").insert({
        session_id: sessionId,
        sender_type: "system",
        message: `Live support connected — ${assigned.display_name || "an agent"} is now helping you.`,
      });

      return NextResponse.json({ ok: true, mode: "human", assigned: assigned.display_name });
    }

    // No admin available
    return NextResponse.json({ ok: true, mode: "ai", assigned: null });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
