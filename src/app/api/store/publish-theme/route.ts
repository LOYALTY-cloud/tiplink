import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCreator } from "@/lib/creatorGuard";

export const runtime = "nodejs";

/**
 * POST /api/store/publish-theme
 * Body: { theme_id: string, publish: boolean }
 *
 * Publishes or unpublishes one of the creator's themes to their active store.
 * - publish=true:  sets is_public=true, store_id=<store.id>, price must already be set
 * - publish=false: sets is_public=false, store_id=null
 */
export async function POST(req: Request) {
  const session = await requireCreator(req);
  if (session instanceof NextResponse) return session;
  const { userId } = session;

  let body: { theme_id?: unknown; publish?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (typeof body.theme_id !== "string" || !body.theme_id.trim()) {
    return NextResponse.json({ error: "theme_id is required" }, { status: 400 });
  }
  const themeId = body.theme_id.trim();
  const publish = body.publish !== false; // default to publish=true

  // Fetch the creator's active store
  const { data: store } = await supabaseAdmin
    .from("creator_stores")
    .select("id, is_active")
    .eq("user_id", userId)
    .maybeSingle();

  // Check upload ban before allowing any publish action
  if (publish) {
    const { data: cmp } = await supabaseAdmin
      .from("creator_marketplace_profiles")
      .select("upload_ban_until")
      .eq("user_id", userId)
      .maybeSingle();
    if (cmp?.upload_ban_until && new Date(cmp.upload_ban_until) > new Date()) {
      return NextResponse.json({ error: "Your Theme Store access is currently suspended." }, { status: 403 });
    }
  }

  if (publish && !store?.is_active) {
    return NextResponse.json(
      { error: "Active store subscription required to publish themes." },
      { status: 403 }
    );
  }

  // Verify theme ownership
  const { data: theme } = await supabaseAdmin
    .from("themes")
    .select("id, price, is_market_active, is_deleted")
    .eq("id", themeId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!theme) {
    return NextResponse.json({ error: "Theme not found or not owned by you" }, { status: 404 });
  }

  if ((theme as Record<string, unknown>).is_deleted) {
    return NextResponse.json({ error: "Deleted themes cannot be re-published" }, { status: 400 });
  }

  // Can't publish a free theme (no price set)
  if (publish && (!theme.price || theme.price <= 0)) {
    return NextResponse.json(
      { error: "Set a price on this theme before publishing it to your store." },
      { status: 400 }
    );
  }

  if (publish && theme.is_market_active === false) {
    return NextResponse.json(
      { error: "This theme is deactivated. Activate it under Saved Themes before publishing." },
      { status: 400 }
    );
  }

  const update = publish
    ? { is_public: true,  store_id: store!.id }
    : { is_public: false, store_id: null };

  const { error: updateErr } = await supabaseAdmin
    .from("themes")
    .update(update)
    .eq("id", themeId)
    .eq("user_id", userId);

  if (updateErr) {
    console.error("store/publish-theme:", updateErr);
    return NextResponse.json({ error: "Failed to update theme" }, { status: 500 });
  }

  return NextResponse.json({ success: true, published: publish });
}
