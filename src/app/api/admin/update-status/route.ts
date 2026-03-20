import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromSession } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

const ALLOWED_STATUSES = ["active", "restricted", "suspended", "closed", "closed_finalized"];

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const session = await getAdminFromSession(jwt);
    if (!session) return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
    requireRole(session.role, "restrict");
    const adminId = session.userId;

    const { user_id, status, confirm_text } = await req.json();
    if (!user_id || typeof user_id !== "string") {
      return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
    }
    // Danger zone: closing or suspending requires typed confirmation
    if ((status === "closed" || status === "suspended") && confirm_text !== status.toUpperCase()) {
      return NextResponse.json({ error: `Dangerous action: type ${status.toUpperCase()} to confirm` }, { status: 400 });
    }
    if (!status || !ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${ALLOWED_STATUSES.join(", ")}` }, { status: 400 });
    }

    const update: Record<string, unknown> = {
      account_status: status,
      status_reason: `admin_action_by_${adminId}`,
    };
    if (status === "closed" || status === "closed_finalized") {
      update.closed_at = new Date().toISOString();
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update(update)
      .eq("user_id", user_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Log admin action
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: adminId,
      action: "update_status",
      target_user: user_id,
      metadata: { new_status: status },
      severity: (status === "closed" || status === "suspended") ? "critical" : "info",
    });

    return NextResponse.json({ ok: true, user_id, status });
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
