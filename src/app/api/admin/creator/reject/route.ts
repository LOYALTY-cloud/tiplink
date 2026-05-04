import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

/**
 * POST /api/admin/creator/reject
 * Body: { application_id, review_notes? }
 * Rejects a creator application.
 */
export async function POST(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(session.role, ["owner", "super_admin"]);

    let body: { application_id?: string; review_notes?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const { application_id, review_notes } = body;
    if (!application_id) {
      return NextResponse.json({ error: "application_id is required" }, { status: 400 });
    }

    const { data: app, error: appErr } = await supabaseAdmin
      .from("creator_applications")
      .select("id, status")
      .eq("id", application_id)
      .maybeSingle();

    if (appErr || !app) return NextResponse.json({ error: "Application not found" }, { status: 404 });
    if (app.status === "approved") {
      return NextResponse.json({ error: "Cannot reject an already approved application" }, { status: 400 });
    }

    await supabaseAdmin
      .from("creator_applications")
      .update({
        status: "rejected",
        review_notes: review_notes || null,
        reviewed_by: session.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", application_id);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("admin/creator/reject:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
