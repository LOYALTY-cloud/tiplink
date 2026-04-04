import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

/** POST — close a support session */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { sessionId } = await params;
    const { messages } = await req.json();
    const now = new Date().toISOString();

    const { data: closed } = await supabaseAdmin
      .from("support_sessions")
      .update({
        status: "closed",
        closed_by: "admin",
        closed_at: now,
        updated_at: now,
      })
      .eq("id", sessionId)
      .in("status", ["waiting", "active"])
      .select("created_at")
      .maybeSingle();

    if (closed) {
      const durationMs = new Date(now).getTime() - new Date(closed.created_at).getTime();
      const firstUserMsg = (
        (Array.isArray(messages) ? messages.find((m: { sender_type: string; message: string }) => m.sender_type === "user")?.message : "") ?? ""
      ).toLowerCase();

      const issueType = ["refund", "charge", "payout"].some((k) => firstUserMsg.includes(k))
        ? "finance"
        : ["withdraw"].some((k) => firstUserMsg.includes(k))
          ? "withdrawal"
          : ["payment", "account"].some((k) => firstUserMsg.includes(k))
            ? "support"
            : ["bug", "error", "crash"].some((k) => firstUserMsg.includes(k))
              ? "bug"
              : "general";

      await supabaseAdmin.from("admin_actions").insert({
        admin_id: admin.userId,
        action: "support_session_closed",
        metadata: {
          session_id: sessionId,
          closed_by: "admin",
          duration_ms: durationMs,
          duration_min: Math.round(durationMs / 60000),
          issue_type: issueType,
          timestamp: now,
        },
      });
    }

    return NextResponse.json({ ok: true, closed: !!closed });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
