import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { sessionId } = await params;
    const { force, adminName } = await req.json();

    let query = supabaseAdmin
      .from("support_sessions")
      .update({
        status: "active",
        assigned_admin_id: admin.userId,
        assigned_admin_name: adminName || "Admin",
        mode: "human",
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    if (!force) {
      query = query.eq("status", "waiting");
    } else {
      query = query.in("status", ["waiting", "active"]);
    }

    const { data, error } = await query.select();

    if (error || !data || data.length === 0) {
      return NextResponse.json({ error: "Could not take over session" }, { status: 409 });
    }

    // Audit log
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: admin.userId,
      action: "support_takeover",
      metadata: {
        session_id: sessionId,
        admin_name: adminName,
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({ ok: true, session: data[0] });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
