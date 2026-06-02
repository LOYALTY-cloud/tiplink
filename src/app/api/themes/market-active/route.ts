import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCreator } from "@/lib/creatorGuard";

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

  const update = active
    ? { is_market_active: true, is_public: true, status: "pending_review" }
    : { is_market_active: false, is_public: false, store_id: null, status: "draft" };

  const { error: updateErr } = await supabaseAdmin
    .from("themes")
    .update(update)
    .eq("id", themeId)
    .eq("user_id", userId);

  if (updateErr) {
    console.error("themes/market-active update:", updateErr);
    return NextResponse.json({ error: "Failed to update theme status" }, { status: 500 });
  }

  return NextResponse.json({ success: true, active });
}
