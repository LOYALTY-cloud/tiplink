import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { THEME_KEYS, type ThemeKey } from "@/lib/themes";

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

    const { theme } = await req.json();

    if (!theme || !THEME_KEYS.includes(theme as ThemeKey)) {
      return NextResponse.json(
        { error: "Invalid theme. Must be one of: " + THEME_KEYS.join(", ") },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ theme })
      .eq("user_id", userData.user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, theme });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
