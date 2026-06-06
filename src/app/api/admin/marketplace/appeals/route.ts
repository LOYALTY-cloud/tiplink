import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";
import { sendEmailAsync } from "@/lib/emailService";
import { emailFooter } from "@/lib/email/footer";
import { createAdminNotification } from "@/lib/adminNotifications";
import { createNotification } from "@/lib/notifications";

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

  // Fetch creator profile + theme name for notifications (non-blocking on main flow)
  const [{ data: profile }, { data: theme }] = await Promise.all([
    supabaseAdmin.from("profiles").select("email, display_name").eq("user_id", appeal.user_id).maybeSingle(),
    supabaseAdmin.from("themes").select("name").eq("id", appeal.theme_id).maybeSingle(),
  ]);

  const creatorEmail = profile?.email ?? null;
  const creatorName  = profile?.display_name ?? "Creator";
  const themeName    = theme?.name ?? "your theme";
  const noteText     = adminNote?.trim() || null;

  if (action === "approve") {
    // In-app notification to creator
    void createNotification({
      userId:   appeal.user_id,
      type:     "appeal_approved",
      title:    `Appeal approved — "${themeName}" is under review`,
      body:     `Great news! Your appeal was successful. "${themeName}" has been reinstated and will go through moderation. We'll notify you once the review is complete.${noteText ? ` Admin note: ${noteText}` : ""}`,
      category: "system",
      entityId: appeal.theme_id,
      skipEmail: true,
    });

    // Creator email — appeal approved
    if (creatorEmail) {
      const html = `
        <div style="font-family:sans-serif;background:#0a0a0a;color:#f3f4f6;padding:40px 24px;max-width:600px;margin:0 auto;border-radius:16px;">
          <div style="text-align:center;margin-bottom:32px;">
            <div style="font-size:20px;font-weight:700;color:#22c55e;">1neLink Theme Store</div>
          </div>
          <h2 style="font-size:22px;font-weight:700;color:#f9fafb;margin:0 0 8px;">Appeal Approved 🎉</h2>
          <p style="color:#9ca3af;margin:0 0 24px;">Hi ${creatorName},</p>
          <p style="color:#d1d5db;line-height:1.6;margin:0 0 20px;">
            Good news — your appeal for <strong style="color:#f9fafb;">"${themeName}"</strong> has been approved.
            The theme has been reinstated and is now back in our moderation queue. We'll send you another notification once the review is complete.
          </p>
          ${noteText ? `
          <div style="background:#1f1f1f;border:1px solid #22c55e44;border-radius:12px;padding:16px 20px;margin:0 0 24px;">
            <p style="color:#86efac;font-size:13px;font-weight:600;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.05em;">Note from Moderation</p>
            <p style="color:#d1d5db;margin:0;line-height:1.6;">${noteText}</p>
          </div>` : ""}
          <div style="text-align:center;margin:28px 0;">
            <a href="https://1nelink.app/dashboard/themebuilder"
               style="display:inline-block;background:#22c55e;color:#000;font-weight:700;padding:12px 28px;border-radius:10px;text-decoration:none;font-size:15px;">
              Go to Theme Builder
            </a>
          </div>
          ${emailFooter()}
        </div>
      `;
      void sendEmailAsync({
        type: "NOTIFICATION",
        to: creatorEmail,
        subject: `Your appeal was approved — "${themeName}" is under review`,
        html,
      });
    }

    // Admin notification: appeal resolved
    void createAdminNotification({
      type: "marketplace_alert",
      title: "Theme Appeal Approved",
      message: `${creatorName}'s appeal for "${themeName}" was approved by ${session.email ?? session.userId}. Theme restored to pending_review.`,
      link: "/admin/marketplace/appeals",
      requiresAction: false,
      priority: "low",
      metadata: { theme_id: appeal.theme_id, appeal_id: appealId, action: "approve" },
    });
  } else {
    // In-app notification to creator
    void createNotification({
      userId:   appeal.user_id,
      type:     "appeal_rejected",
      title:    `Appeal not approved — "${themeName}"`,
      body:     `We've reviewed your appeal for "${themeName}" and are unable to reverse the original decision. Please ensure your theme meets our marketplace guidelines before making any revisions.${noteText ? ` Admin note: ${noteText}` : ""}`,
      category: "system",
      entityId: appeal.theme_id,
      skipEmail: true,
    });

    // Creator email — appeal rejected
    if (creatorEmail) {
      const html = `
        <div style="font-family:sans-serif;background:#0a0a0a;color:#f3f4f6;padding:40px 24px;max-width:600px;margin:0 auto;border-radius:16px;">
          <div style="text-align:center;margin-bottom:32px;">
            <div style="font-size:20px;font-weight:700;color:#22c55e;">1neLink Theme Store</div>
          </div>
          <h2 style="font-size:22px;font-weight:700;color:#f9fafb;margin:0 0 8px;">Appeal Update</h2>
          <p style="color:#9ca3af;margin:0 0 24px;">Hi ${creatorName},</p>
          <p style="color:#d1d5db;line-height:1.6;margin:0 0 20px;">
            We've reviewed your appeal for <strong style="color:#f9fafb;">"${themeName}"</strong> and are unable to reverse the original moderation decision at this time.
          </p>
          ${noteText ? `
          <div style="background:#1f1f1f;border:1px solid #ef444444;border-radius:12px;padding:16px 20px;margin:0 0 24px;">
            <p style="color:#f87171;font-size:13px;font-weight:600;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.05em;">Note from Moderation</p>
            <p style="color:#d1d5db;margin:0;line-height:1.6;">${noteText}</p>
          </div>` : ""}
          <p style="color:#d1d5db;line-height:1.6;margin:0 0 24px;">
            If you'd like to create a new theme that complies with our
            <a href="https://1nelink.app/dashboard/support/help" style="color:#22c55e;text-decoration:none;">Theme Marketplace Guidelines</a>,
            you're welcome to submit a new design for review.
          </p>
          <div style="text-align:center;margin:28px 0;">
            <a href="https://1nelink.app/dashboard/themebuilder"
               style="display:inline-block;background:#22c55e;color:#000;font-weight:700;padding:12px 28px;border-radius:10px;text-decoration:none;font-size:15px;">
              Go to Theme Builder
            </a>
          </div>
          ${emailFooter()}
        </div>
      `;
      void sendEmailAsync({
        type: "NOTIFICATION",
        to: creatorEmail,
        subject: `Update on your appeal for "${themeName}"`,
        html,
      });
    }

    // Admin notification: appeal resolved
    void createAdminNotification({
      type: "marketplace_alert",
      title: "Theme Appeal Rejected",
      message: `${creatorName}'s appeal for "${themeName}" was rejected by ${session.email ?? session.userId}.`,
      link: "/admin/marketplace/appeals",
      requiresAction: false,
      priority: "low",
      metadata: { theme_id: appeal.theme_id, appeal_id: appealId, action: "reject" },
    });
  }

  return NextResponse.json({ success: true });
}
