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

    const { themeId } = await req.json();
    if (!themeId) return NextResponse.json({ error: "themeId required" }, { status: 400 });

    // Fetch the theme's owner so we can stamp store_id on approval
    const { data: themeRow } = await supabaseAdmin
      .from("themes")
      .select("user_id, store_id")
      .eq("id", themeId)
      .maybeSingle();

    // If the theme doesn't already have a store_id, look up the creator's active store
    let storeId: string | null = themeRow?.store_id ?? null;
    if (!storeId && themeRow?.user_id) {
      const { data: store } = await supabaseAdmin
        .from("creator_stores")
        .select("id")
        .eq("user_id", themeRow.user_id)
        .eq("is_active", true)
        .maybeSingle();
      storeId = store?.id ?? null;
    }

    const { data: updatedTheme, error } = await supabaseAdmin
      .from("themes")
      .update({ status: "approved", is_public: true, moderation_reason: null, queue_entered_at: null, ...(storeId ? { store_id: storeId } : {}) })
      .eq("id", themeId)
      .select("user_id")
      .single();

    if (error) return NextResponse.json({ error: "Failed to approve theme." }, { status: 500 });

    // Log admin action
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: session.userId,
      action: "marketplace_theme_approve",
      metadata: { theme_id: themeId },
      severity: "low",
    }).then(null, () => {});

    // Write moderation log for audit trail
    void supabaseAdmin.from("moderation_logs").insert({
      theme_id: themeId,
      creator_id: updatedTheme?.user_id ?? null,
      event_type: "human_approve",
      ai_reason: "Approved by admin",
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
