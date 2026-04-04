import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromSession } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

const REOPEN_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }

    // Admin auth
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const adminId = req.headers.get("x-admin-id") ?? body.adminId ?? null;
    const admin = await getAdminFromSession(token, adminId);

    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Fetch the closed session
    const { data: session } = await supabaseAdmin
      .from("support_sessions")
      .select("id, status, closed_at, assigned_admin_id")
      .eq("id", sessionId)
      .eq("status", "closed")
      .maybeSingle();

    if (!session) {
      return NextResponse.json({ error: "Session not found or not closed" }, { status: 404 });
    }

    // Check reopen window
    if (session.closed_at) {
      const closedAge = Date.now() - new Date(session.closed_at).getTime();
      if (closedAge > REOPEN_WINDOW_MS) {
        return NextResponse.json({ error: "Reopen window expired (10 min max)" }, { status: 410 });
      }
    }

    const now = new Date().toISOString();

    // Race-safe: only one reopen succeeds (double-reopen guard)
    const { data: reopened, error } = await supabaseAdmin
      .from("support_sessions")
      .update({
        status: "active",
        closed_at: null,
        closed_by: null,
        assigned_admin_id: admin.userId,
        updated_at: now,
      })
      .eq("id", sessionId)
      .eq("status", "closed")
      .select("id")
      .maybeSingle();

    if (error || !reopened) {
      return NextResponse.json({ error: "Failed to reopen — session may have been reopened already" }, { status: 409 });
    }

    // Insert system message so chat shows reopen marker
    await supabaseAdmin.from("support_messages").insert({
      session_id: sessionId,
      sender_type: "admin",
      sender_id: admin.userId,
      sender_name: null,
      message: "⟳ Session reopened by support",
    });

    // Audit log
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: admin.userId,
      action: "support_session_reopened",
      metadata: {
        session_id: sessionId,
        timestamp: now,
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
