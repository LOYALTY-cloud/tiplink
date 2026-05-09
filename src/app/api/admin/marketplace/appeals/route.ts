import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

/**
 * GET  /api/admin/marketplace/appeals        — List appeals (default: pending)
 * PATCH /api/admin/marketplace/appeals       — Approve or reject an appeal
 */
export async function GET(req: Request) {
  const session = await getAdminFromRequest(req);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try { requireRole(session.role, ["owner", "super_admin", "admin", "moderator"]); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "pending";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = 25;
  const offset = (page - 1) * pageSize;

  const { data, error, count } = await supabaseAdmin
    .from("theme_appeals")
    .select(
      `id, status, reason, admin_note, created_at, reviewed_at,
       theme:themes(id, name, status, preview_images, risk_score, moderation_reason),
       creator:profiles!theme_appeals_user_id_fkey(handle, display_name, email)`,
      { count: "exact" }
    )
    .eq("status", status)
    .order("created_at", { ascending: true })
    .range(offset, offset + pageSize - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ appeals: data ?? [], total: count ?? 0 });
}

export async function PATCH(req: Request) {
  const session = await getAdminFromRequest(req);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try { requireRole(session.role, ["owner", "super_admin", "admin", "moderator"]); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  let body: { appealId?: string; action?: string; adminNote?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { appealId, action, adminNote } = body;
  if (!appealId) return NextResponse.json({ error: "appealId is required." }, { status: 400 });
  if (!["approve", "reject"].includes(action ?? "")) {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'." }, { status: 400 });
  }

  const { data: appeal, error: fetchErr } = await supabaseAdmin
    .from("theme_appeals")
    .select("id, theme_id, status, user_id")
    .eq("id", appealId)
    .maybeSingle();

  if (fetchErr || !appeal) return NextResponse.json({ error: "Appeal not found." }, { status: 404 });
  if (appeal.status !== "pending") return NextResponse.json({ error: "Appeal already reviewed." }, { status: 409 });

  const newStatus = action === "approve" ? "approved" : "rejected";

  // Update the appeal
  const { error: updateErr } = await supabaseAdmin
    .from("theme_appeals")
    .update({
      status: newStatus,
      admin_note: adminNote?.trim().slice(0, 1000) ?? null,
      reviewed_by: session.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", appealId);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Write moderation log for audit trail
  void supabaseAdmin.from("moderation_logs").insert({
    theme_id: appeal.theme_id,
    creator_id: appeal.user_id,
    event_type: action === "approve" ? "appeal_approved" : "appeal_rejected",
    ai_reason: adminNote?.trim().slice(0, 300) ?? (action === "approve" ? "Appeal approved" : "Appeal rejected"),
    reviewed_by: session.userId,
  });

  // If approved, restore the theme to pending_review so it goes through moderation
  // and remove the associated strike to keep active_strikes accurate.
  if (action === "approve") {
    await supabaseAdmin
      .from("themes")
      .update({ status: "pending_review", moderation_reason: null })
      .eq("id", appeal.theme_id);

    // Delete the strike for this specific theme
    await supabaseAdmin
      .from("creator_strikes")
      .delete()
      .eq("creator_id", appeal.user_id)
      .eq("theme_id", appeal.theme_id);

    // Recount active strikes and sync the profile
    const { count: activeStrikes } = await supabaseAdmin
      .from("creator_strikes")
      .select("*", { count: "exact", head: true })
      .eq("creator_id", appeal.user_id)
      .or("expires_at.is.null,expires_at.gt." + new Date().toISOString());

    const strikes = activeStrikes ?? 0;
    const banUpdate: Record<string, unknown> = { active_strikes: strikes };

    // Clear the upload ban if strikes dropped below the threshold
    if (strikes < 3) {
      banUpdate.upload_ban_until = strikes >= 2
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        : null;
    }

    await supabaseAdmin
      .from("creator_marketplace_profiles")
      .update(banUpdate)
      .eq("user_id", appeal.user_id);
  }

  return NextResponse.json({ success: true });
}
