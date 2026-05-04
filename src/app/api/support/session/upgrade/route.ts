import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { assignBestAdmin } from "@/lib/support/autoAssign";

export const runtime = "nodejs";

/**
 * Upgrade a support session from AI mode to human mode.
 * Triggered when user explicitly asks for live support.
 * Tries to assign an available admin; otherwise keeps session in priority waiting.
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

    // User explicitly requested live support: escalate priority first.
    const nextPriority = Math.max(session.priority ?? 0, 2);
    await supabaseAdmin
      .from("support_sessions")
      .update({
        escalation: true,
        escalated_at: new Date().toISOString(),
        priority: nextPriority,
      })
      .eq("id", sessionId);

    // Try assigning an available admin now (only because user/escalation requested live support).
    const assigned = await assignBestAdmin(sessionId, {
      priority: nextPriority,
      message: "live support requested",
      confidence: 1,
    });

    if (assigned) {
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

    // No admins active/available right now: keep AI active and keep this chat prioritized.
    await supabaseAdmin
      .from("support_sessions")
      .update({
        mode: "ai",
        status: "waiting",
        priority: Math.max(nextPriority, 3),
        assigned_admin_id: null,
        assigned_admin_name: null,
      })
      .eq("id", sessionId);

    await supabaseAdmin.from("support_messages").insert({
      session_id: sessionId,
      sender_type: "system",
      message: "No admin is active right now. Your chat is marked priority and an admin will join when one becomes available.",
    });

    return NextResponse.json({ ok: true, mode: "ai", assigned: null, queued: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
