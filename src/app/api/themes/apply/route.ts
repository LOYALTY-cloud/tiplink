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
    const themeId = typeof body.theme_id === "string" ? body.theme_id : null;
    if (!themeId) return NextResponse.json({ error: "Missing theme_id" }, { status: 400 });

    // Verify the theme belongs to this user and has not been deleted
    const { data: theme, error: fetchErr } = await supabaseAdmin
      .from("themes")
      .select("id")
      .eq("id", themeId)
      .eq("user_id", userId)
      .neq("is_deleted", true)
      .maybeSingle();

    if (fetchErr || !theme) {
      return NextResponse.json({ error: "Theme not found" }, { status: 404 });
    }

    // Clear existing active theme, then set the new one (two-step to avoid race)
    await supabaseAdmin
      .from("themes")
      .update({ is_active: false })
      .eq("user_id", userId);

    const { error: applyErr } = await supabaseAdmin
      .from("themes")
      .update({ is_active: true })
      .eq("id", themeId)
      .eq("user_id", userId);

    if (applyErr) {
      console.error("themes/apply:", applyErr);
      return NextResponse.json({ error: applyErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("themes/apply unexpected:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** DELETE /api/themes/apply — remove the active theme, reverting to default system theme */
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

    await supabaseAdmin
      .from("themes")
      .update({ is_active: false })
      .eq("user_id", userId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("themes/apply DELETE unexpected:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
