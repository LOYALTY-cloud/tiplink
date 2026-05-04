import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { THEME_KEYS, type ThemeKey, FREE_THEMES, isThemeUnlocked } from "@/lib/themes";

export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: userData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !userData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = userData.user.id;
    const { theme } = await req.json();

    if (!theme || !THEME_KEYS.includes(theme as ThemeKey)) {
      return NextResponse.json(
        { error: "Invalid theme. Must be one of: " + THEME_KEYS.join(", ") },
        { status: 400 }
      );
    }

    // Verify the user owns this theme
    if (!FREE_THEMES.includes(theme as ThemeKey)) {
      const { data: purchases } = await supabaseAdmin
        .from("theme_purchases")
        .select("theme")
        .eq("user_id", userId);
      const unlocked = purchases?.map((p: { theme: string }) => p.theme) ?? [];
      if (!isThemeUnlocked(theme, unlocked)) {
        return NextResponse.json({ error: "Theme not unlocked" }, { status: 403 });
      }
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ theme })
      .eq("user_id", userId);

    if (error) {
      console.error("profile/theme update", error);
      return NextResponse.json({ error: "Failed to update theme" }, { status: 500 });
    }

    return NextResponse.json({ success: true, theme });
  } catch (e: unknown) {
    console.error("profile/theme", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
