import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(session.role, ["owner", "super_admin", "admin", "moderator"]);

    const body = await req.json();
    const { themeId, reason } = body;
    if (!themeId) return NextResponse.json({ error: "themeId required" }, { status: 400 });

    const { data: updatedTheme, error } = await supabaseAdmin
      .from("themes")
      .update({
        status: "flagged",
        is_public: false,
        moderation_reason: reason ? String(reason).slice(0, 300) : "Flagged by admin",
      })
      .eq("id", themeId)
      .select("user_id")
      .single();

    if (error) return NextResponse.json({ error: "Failed to flag theme." }, { status: 500 });

    await supabaseAdmin.from("admin_actions").insert({
      admin_id: session.userId,
      action: "marketplace_theme_flag",
      metadata: { theme_id: themeId, reason },
      severity: "medium",
    }).then(null, () => {});

    // Write moderation log for audit trail
    void supabaseAdmin.from("moderation_logs").insert({
      theme_id: themeId,
      creator_id: updatedTheme?.user_id ?? null,
      event_type: "human_flag",
      ai_reason: reason ? String(reason).slice(0, 300) : "Flagged by admin",
      reviewed_by: session.userId,
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }
}
