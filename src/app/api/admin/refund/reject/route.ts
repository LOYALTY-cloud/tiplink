import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

/** POST — reject a pending refund request */
export async function POST(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(session.role, "refund");
    const adminId = session.userId;

    const { refund_id, reason } = await req.json();
    if (!refund_id) return NextResponse.json({ error: "Missing refund_id" }, { status: 400 });

    const { data: refund, error: refundErr } = await supabaseAdmin
      .from("refund_requests")
      .select("*")
      .eq("id", refund_id)
      .single();

    if (refundErr || !refund) return NextResponse.json({ error: "Refund request not found" }, { status: 404 });
    if (refund.status !== "pending") return NextResponse.json({ error: `Request already ${refund.status}` }, { status: 400 });

    await supabaseAdmin
      .from("refund_requests")
      .update({ status: "rejected" })
      .eq("id", refund_id);

    await supabaseAdmin.from("admin_actions").insert({
      admin_id: adminId,
      action: "refund_reject",
      target_user: null,
      metadata: {
        refund_request_id: refund_id,
        tip_intent_id: refund.tip_intent_id,
        amount: refund.amount,
        reason: reason || null,
      },
      severity: "info",
    });

    return NextResponse.json({ ok: true, message: "Refund request rejected" });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const errMsg = e instanceof Error ? e.message : String(e ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
