import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function DELETE(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authData.user.id;

    let unlock_id: unknown;
    try {
      ({ unlock_id } = await req.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (typeof unlock_id !== "string" || !unlock_id.trim()) {
      return NextResponse.json({ error: "unlock_id is required" }, { status: 400 });
    }

    // Verify ownership before deleting
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("theme_unlocks")
      .select("id, theme_name")
      .eq("id", unlock_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (fetchErr) {
      console.error("my-themes/remove fetch error:", fetchErr);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }

    if (!existing) {
      return NextResponse.json({ error: "Theme not found in your library" }, { status: 404 });
    }

    const { error: deleteErr } = await supabaseAdmin
      .from("theme_unlocks")
      .delete()
      .eq("id", unlock_id)
      .eq("user_id", userId);

    if (deleteErr) {
      console.error("my-themes/remove delete error:", deleteErr);
      return NextResponse.json({ error: "Failed to remove theme" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("my-themes/remove unexpected:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
