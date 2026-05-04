import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

/**
 * POST /api/admin/creator/approve
 * Body: { application_id, review_notes? }
 * Approves a creator application, sets is_creator=true on profiles.
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
      .select("id, user_id, status")
      .eq("id", application_id)
      .maybeSingle();

    if (appErr || !app) return NextResponse.json({ error: "Application not found" }, { status: 404 });
    if (app.status === "approved") {
      return NextResponse.json({ error: "Already approved" }, { status: 400 });
    }

    const now = new Date().toISOString();

    // Set is_creator on profile
    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update({ is_creator: true })
      .eq("user_id", app.user_id);

    if (profErr) {
      console.error("admin/creator/approve: profile update error", profErr);
      return NextResponse.json({ error: "Failed to approve" }, { status: 500 });
    }

    // Mark application approved
    await supabaseAdmin
      .from("creator_applications")
      .update({
        status: "approved",
        review_notes: review_notes || null,
        reviewed_by: session.userId,
        reviewed_at: now,
      })
      .eq("id", application_id);

    // Notify the user they've been approved as a creator
    try {
      const { createNotification } = await import("@/lib/notifications");
      await createNotification({
        userId: app.user_id,
        type: "creator_approved",
        title: "You're approved as a Creator! 🎨",
        body: "Your account has been approved for monetization. Theme Builder is now available in your menu.",
        category: "system",
        entityId: application_id,
      });
    } catch (_) {}

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("admin/creator/approve:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
