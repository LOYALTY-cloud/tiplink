import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authData.user.id;

    const { data, error } = await supabaseAdmin
      .from("themes")
      .select("id, name, config, is_active, created_at, price, is_public, unlock_count, is_market_active, version, parent_theme_id")
      .eq("user_id", userId)
      .neq("is_deleted", true)
      .neq("is_applied_unlock", true)
      .order("created_at", { ascending: false })
      .limit(100); // fetch more so we can filter superseded versions client-side

    if (error) {
      console.error("themes/saved:", error);
      return NextResponse.json({ error: "Failed to load saved themes." }, { status: 500 });
    }

    // Filter out old versions — a theme is superseded if another theme in this
    // list has parent_theme_id pointing to it.
    const allThemes = data ?? [];
    const supersededIds = new Set(
      allThemes
        .map((t) => t.parent_theme_id)
        .filter(Boolean)
    );
    const themes = allThemes.filter((t) => !supersededIds.has(t.id));

    return NextResponse.json({ themes });
  } catch (err) {
    console.error("themes/saved unexpected:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
