import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";
import { applyStrike } from "@/lib/marketplace/strikes";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(session.role, ["owner", "super_admin", "admin"]);

    const body = await req.json();
    const { themeId, reason } = body;
    if (!themeId || !reason) {
      return NextResponse.json({ error: "themeId and reason are required." }, { status: 400 });
    }

    // Get the theme's creator
    const { data: theme } = await supabaseAdmin
      .from("themes")
      .select("user_id")
      .eq("id", themeId)
      .maybeSingle();
    if (!theme) return NextResponse.json({ error: "Theme not found." }, { status: 404 });

    const { strikes } = await applyStrike(theme.user_id, themeId, String(reason).slice(0, 300));

    await supabaseAdmin.from("admin_actions").insert({
      admin_id: session.userId,
      action: "marketplace_creator_strike",
      target_user: theme.user_id,
      metadata: { theme_id: themeId, reason, total_strikes: strikes },
      severity: strikes >= 3 ? "critical" : "high",
    }).then(null, () => {});

    // Write moderation log for audit trail
    void supabaseAdmin.from("moderation_logs").insert({
      theme_id: themeId,
      creator_id: theme.user_id,
      event_type: "human_strike",
      ai_reason: String(reason).slice(0, 300),
      reviewed_by: session.userId,
      metadata: { total_strikes: strikes },
    });

    return NextResponse.json({ ok: true, strikes });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }
}
