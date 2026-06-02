import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";
import { sendEmail } from "@/lib/emailService";
import { emailFooter } from "@/lib/email/footer";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(session.role, ["owner", "super_admin", "admin", "moderator"]);

    let body: { themeId?: unknown; reason?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const themeId = typeof body.themeId === "string" ? body.themeId.trim() : null;
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";

    if (!themeId) return NextResponse.json({ error: "themeId required" }, { status: 400 });
    if (!reason) return NextResponse.json({ error: "A rejection reason is required" }, { status: 400 });

    // Fetch theme + creator info before updating
    const { data: theme, error: fetchErr } = await supabaseAdmin
      .from("themes")
      .select("id, name, user_id")
      .eq("id", themeId)
      .single();

    if (fetchErr || !theme) {
      return NextResponse.json({ error: "Theme not found" }, { status: 404 });
    }

    // Fetch creator profile + email
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email, display_name")
      .eq("user_id", theme.user_id)
      .maybeSingle();

    // Update theme: removed (not approved), not public, store reason
    const { error: updateErr } = await supabaseAdmin
      .from("themes")
      .update({
        status: "removed",
        is_public: false,
        is_market_active: false,
        moderation_reason: reason,
      })
      .eq("id", themeId);

    if (updateErr) {
      return NextResponse.json({ error: "Failed to reject theme." }, { status: 500 });
    }

    // Log admin action
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: session.userId,
      action: "marketplace_theme_reject",
      metadata: { theme_id: themeId, reason },
      severity: "medium",
    }).then(null, () => {});

    // Moderation log for audit trail
    void supabaseAdmin.from("moderation_logs").insert({
      theme_id: themeId,
      creator_id: theme.user_id,
      event_type: "human_reject",
      ai_reason: reason,
      reviewed_by: session.userId,
    });

    // In-app notification (non-blocking, skip email — dedicated email sent below)
    void createNotification({
      userId: theme.user_id,
      type: "theme_rejected",
      title: `Your theme "${themeName}" was not approved`,
      body: reason,
      category: "system",
      entityId: themeId,
      skipEmail: true,
    });

    // Send rejection email to creator
    const creatorEmail = profile?.email ?? null;
    const creatorName = profile?.display_name ?? "Creator";
    const themeName = theme.name ?? "your theme";

    if (creatorEmail) {
      const html = `
        <div style="font-family:sans-serif;background:#0a0a0a;color:#f3f4f6;padding:40px 24px;max-width:600px;margin:0 auto;border-radius:16px;">
          <div style="text-align:center;margin-bottom:32px;">
            <div style="font-size:20px;font-weight:700;color:#22c55e;">1neLink Theme Store</div>
          </div>

          <h2 style="font-size:22px;font-weight:700;color:#f9fafb;margin:0 0 8px;">Theme Submission Update</h2>
          <p style="color:#9ca3af;margin:0 0 24px;">Hi ${creatorName},</p>

          <p style="color:#d1d5db;line-height:1.6;margin:0 0 20px;">
            We've reviewed your theme submission <strong style="color:#f9fafb;">"${themeName}"</strong> and unfortunately it did not meet our marketplace guidelines at this time.
          </p>

          <div style="background:#1f1f1f;border:1px solid #ef4444;border-radius:12px;padding:16px 20px;margin:0 0 24px;">
            <p style="color:#f87171;font-size:13px;font-weight:600;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.05em;">Reason for Rejection</p>
            <p style="color:#d1d5db;margin:0;line-height:1.6;">${reason}</p>
          </div>

          <p style="color:#d1d5db;line-height:1.6;margin:0 0 16px;">
            You may revise your theme to address the reason above and resubmit it for review. Please ensure your submission complies with our
            <a href="https://1nelink.app/dashboard/support/help" style="color:#22c55e;text-decoration:none;">Theme Marketplace Guidelines</a>
            before resubmitting.
          </p>

          <p style="color:#d1d5db;line-height:1.6;margin:0 0 24px;">
            If you believe this decision was made in error, you can appeal by submitting a support ticket with the subject <strong style="color:#f9fafb;">"Theme Rejection Appeal – ${themeName}"</strong>.
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

      void sendEmail({
        type: "THEME_REJECTED",
        to: creatorEmail,
        subject: `Your theme "${themeName}" was not approved`,
        html,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }
}
