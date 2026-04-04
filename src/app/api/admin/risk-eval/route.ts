import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";
import { evaluateRisk } from "@/lib/riskEngine";

export const runtime = "nodejs";

/**
 * POST /api/admin/risk-eval — Manually evaluate risk rules for a user
 * Body: { user_id: string }
 */
export async function POST(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
    requireRole(session.role, "risk_eval");
    const adminId = session.userId;

    const { user_id } = await req.json();
    if (!user_id || typeof user_id !== "string") {
      return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
    }

    const result = await evaluateRisk(supabaseAdmin, user_id);

    // Log the manual evaluation
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: adminId,
      action: "risk_eval",
      target_user: user_id,
      metadata: result,
      severity: result.restricted ? "critical" : "info",
    });

    return NextResponse.json(result);
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
