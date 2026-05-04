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
      .limit(20);

    if (error) {
      console.error("themes/saved:", error);
      return NextResponse.json({ error: "Failed to load saved themes." }, { status: 500 });
    }

    return NextResponse.json({ themes: data ?? [] });
  } catch (err) {
    console.error("themes/saved unexpected:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
