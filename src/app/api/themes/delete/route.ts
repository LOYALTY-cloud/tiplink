import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCreator } from "@/lib/creatorGuard";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await requireCreator(req);
    if (session instanceof NextResponse) return session;
    const { userId } = session;

    const body = await req.json();
    const themeId = typeof body.theme_id === "string" ? body.theme_id : null;
    if (!themeId) return NextResponse.json({ error: "Missing theme_id" }, { status: 400 });

    // Soft-delete: never hard-delete themes — buyers keep their snapshot ownership.
    // Mark theme as deleted and de-list from all surfaces.
    const { error } = await supabaseAdmin
      .from("themes")
      .update({
        is_deleted: true,
        is_public: false,
        is_market_active: false,
        is_active: false,
      })
      .eq("id", themeId)
      .eq("user_id", userId);

    if (error) {
      console.error("themes/delete:", error);
      return NextResponse.json({ error: "Failed to delete theme. Please try again." }, { status: 500 });
    }

    // Propagate to buyer records so they see "no longer sold" badge (best-effort).
    void supabaseAdmin
      .from("theme_unlocks")
      .update({ is_deleted_source: true })
      .eq("theme_id", themeId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("themes/delete unexpected:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
