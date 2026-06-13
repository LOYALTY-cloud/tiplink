import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCreator } from "@/lib/creatorGuard";
import { createAdminNotification } from "@/lib/adminNotifications";

export const runtime = "nodejs";

/**
 * POST /api/themes/market-active
 * Body: { theme_id: string, active: boolean }
 *
 * Controls whether a theme can be sold in the marketplace.
 * Deactivating a theme also unpublishes it.
 */
export async function POST(req: Request) {
  const session = await requireCreator(req);
  if (session instanceof NextResponse) return session;
  const { userId } = session;

  let body: { theme_id?: unknown; active?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (typeof body.theme_id !== "string" || !body.theme_id.trim()) {
    return NextResponse.json({ error: "theme_id is required" }, { status: 400 });
  }
  if (typeof body.active !== "boolean") {
    return NextResponse.json({ error: "active must be boolean" }, { status: 400 });
  }

  const themeId = body.theme_id.trim();
  const active = body.active;

  const { data: theme } = await supabaseAdmin
    .from("themes")
    .select("id")
    .eq("id", themeId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!theme) {
    return NextResponse.json({ error: "Theme not found or not owned by you" }, { status: 404 });
  }

  // Look up the creator's active store so we can stamp store_id when activating
  const { data: store } = await supabaseAdmin
    .from("creator_stores")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  const update = active
    ? { is_market_active: true, is_public: true, status: "pending_review", queue_entered_at: new Date().toISOString(), store_id: store?.id ?? null }
    : { is_market_active: false, is_public: false, store_id: null, status: "draft", queue_entered_at: null };

  const { error: updateErr } = await supabaseAdmin
    .from("themes")
    .update(update)
    .eq("id", themeId)
    .eq("user_id", userId);

  if (updateErr) {
    console.error("themes/market-active update:", updateErr);
    return NextResponse.json({ error: "Failed to update theme status" }, { status: 500 });
  }

  // Notify all admins/moderators when theme enters the review queue
  if (active) {
    const { data: theme } = await supabaseAdmin
      .from("themes")
      .select("name")
      .eq("id", themeId)
      .maybeSingle();
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("display_name, handle")
      .eq("user_id", userId)
      .maybeSingle();
    const creatorName = profile?.display_name || profile?.handle || "A creator";
    const themeName = theme?.name || "a theme";
    void createAdminNotification({
      type: "marketplace_alert",
      title: "New theme submitted for review",
      message: `${creatorName} submitted "${themeName}" for marketplace review. Pending a moderation decision.`,
      link: "/admin/marketplace",
      requiresAction: true,
      priority: "medium",
      visibility: "role",
      roleTarget: ["owner", "co_owner", "super_admin", "admin", "moderator"],
      metadata: { theme_id: themeId, user_id: userId, creator: creatorName },
    });
  }

  return NextResponse.json({ success: true, active });
}
