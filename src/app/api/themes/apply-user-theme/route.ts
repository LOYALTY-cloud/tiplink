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

    let themeConfig: Record<string, unknown> | null = null;
    let themeName = "Unlocked Theme";

    if (unlockId) {
      const { data: unlock, error: unlockErr } = await supabaseAdmin
        .from("theme_unlocks")
        .select("id, theme_name, theme_config")
        .eq("id", unlockId)
        .eq("user_id", userId)
        .maybeSingle();

      if (unlockErr || !unlock) {
        return NextResponse.json({ error: "Owned theme not found" }, { status: 404 });
      }

      if (!unlock.theme_config || typeof unlock.theme_config !== "object") {
        return NextResponse.json({ error: "Theme snapshot is missing config" }, { status: 400 });
      }

      themeConfig = unlock.theme_config as Record<string, unknown>;
      if (typeof unlock.theme_name === "string" && unlock.theme_name.trim()) {
        themeName = unlock.theme_name.trim().slice(0, 100);
      }
    } else if (body.config && typeof body.config === "object") {
      themeConfig = body.config as Record<string, unknown>;
      if (typeof body.theme_name === "string" && body.theme_name.trim()) {
        themeName = body.theme_name.trim().slice(0, 100);
      }
    }

    if (!themeConfig) {
      return NextResponse.json({ error: "Missing unlock_id or config" }, { status: 400 });
    }

    // Best-effort compatibility write for profile-based theme consumers.
    // If the column does not exist in this environment, continue with the
    // canonical themes-table activation flow below.
    const { error: profileThemeErr } = await supabaseAdmin
      .from("profiles")
      .update({ active_theme_config: themeConfig })
      .eq("user_id", userId);

    if (profileThemeErr && profileThemeErr.code !== "PGRST204") {
      console.warn("themes/apply-user-theme profile update warning:", profileThemeErr.message);
    }

    await supabaseAdmin
      .from("themes")
      .update({ is_active: false })
      .eq("user_id", userId);

    const { data: created, error: createErr } = await supabaseAdmin
      .from("themes")
      .insert({
        user_id: userId,
        name: themeName,
        config: themeConfig,
        is_active: true,
        is_public: false,
        is_applied_unlock: true,
      })
      .select("id")
      .single();

    if (createErr) {
      console.error("themes/apply-user-theme:", createErr);
      return NextResponse.json({ error: "Failed to apply owned theme" }, { status: 500 });
    }

    // Track last-used timestamp on the unlock record.
    if (unlockId) {
      await supabaseAdmin
        .from("theme_unlocks")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", unlockId)
        .eq("user_id", userId);
    }

    return NextResponse.json({ ok: true, theme_id: created.id });
  } catch (err) {
    console.error("themes/apply-user-theme unexpected:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
