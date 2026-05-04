import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.replace("Bearer ", "") : null;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authData.user.id;

    // Clear active theme config on profile
    const { error: profileErr } = await supabaseAdmin
      .from("profiles")
      .update({ active_theme_config: null })
      .eq("user_id", userId);

    if (profileErr && profileErr.code !== "PGRST204") {
      console.warn("themes/unapply-user-theme profile update warning:", profileErr.message);
    }

    // Deactivate all theme records for the user
    await supabaseAdmin
      .from("themes")
      .update({ is_active: false })
      .eq("user_id", userId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("themes/unapply-user-theme unexpected:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
