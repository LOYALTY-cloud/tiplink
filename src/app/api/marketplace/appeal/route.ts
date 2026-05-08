import { NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * POST /api/marketplace/appeal
 * Creator submits an appeal for a flagged/removed theme.
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseRouteClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { themeId?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const themeId = body.themeId?.trim();
  const reason = body.reason?.trim();

  if (!themeId) return NextResponse.json({ error: "themeId is required." }, { status: 400 });
  if (!reason || reason.length < 10) return NextResponse.json({ error: "Reason must be at least 10 characters." }, { status: 400 });
  if (reason.length > 2000) return NextResponse.json({ error: "Reason must be under 2000 characters." }, { status: 400 });

  // Verify the theme belongs to this creator and is in an appealable state
  const { data: theme, error: themeErr } = await supabaseAdmin
    .from("themes")
    .select("id, status, user_id")
    .eq("id", themeId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (themeErr || !theme) {
    return NextResponse.json({ error: "Theme not found." }, { status: 404 });
  }
  if (!["flagged", "removed"].includes(theme.status)) {
    return NextResponse.json({ error: "Only flagged or removed themes can be appealed." }, { status: 400 });
  }

  // Check for existing appeal
  const { data: existing } = await supabaseAdmin
    .from("theme_appeals")
    .select("id, status")
    .eq("theme_id", themeId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    if (existing.status === "pending") {
      return NextResponse.json({ error: "You already have a pending appeal for this theme." }, { status: 409 });
    }
    // Rejected appeal: allow re-appeal by deleting old row (unique constraint allows one at a time)
    await supabaseAdmin.from("theme_appeals").delete().eq("id", existing.id);
  }

  const { error: insertErr } = await supabaseAdmin.from("theme_appeals").insert({
    theme_id: themeId,
    user_id: user.id,
    reason: reason.slice(0, 2000),
  });

  if (insertErr) {
    return NextResponse.json({ error: "Failed to submit appeal." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
