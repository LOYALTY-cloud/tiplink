import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authData.user.id;
    const body = await req.json();
    const unlockId = typeof body.unlock_id === "string" ? body.unlock_id : null;
    const isFavorite = typeof body.is_favorite === "boolean" ? body.is_favorite : null;

    if (!unlockId || isFavorite === null) {
      return NextResponse.json({ error: "Missing unlock_id or is_favorite" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("theme_unlocks")
      .update({ is_favorite: isFavorite })
      .eq("id", unlockId)
      .eq("user_id", userId);

    if (error) {
      console.error("api/my-themes/favorite:", error);
      return NextResponse.json({ error: "Failed to update favorite" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, is_favorite: isFavorite });
  } catch (err) {
    console.error("api/my-themes/favorite unexpected:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
