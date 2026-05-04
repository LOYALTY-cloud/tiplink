import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authData.user.id;

    const { data, error } = await supabaseAdmin
      .from("theme_unlocks")
      .select("id, theme_id, parent_theme_id, creator_id, theme_name, theme_config, unlocked_via, created_at, is_favorite, last_used_at, is_deleted_source")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("api/my-themes:", error);
      return NextResponse.json({ error: "Failed to load owned themes" }, { status: 500 });
    }

    return NextResponse.json({ themes: data ?? [] });
  } catch (err) {
    console.error("api/my-themes unexpected:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
