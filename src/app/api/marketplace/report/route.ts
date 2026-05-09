import { NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { REPORT_REASONS } from "@/lib/marketplace/strikes";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { themeId?: string; reason?: string; details?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { themeId, reason, details } = body;
  if (!themeId || !reason) {
    return NextResponse.json({ error: "themeId and reason are required." }, { status: 400 });
  }
  if (!(REPORT_REASONS as readonly string[]).includes(reason)) {
    return NextResponse.json({ error: "Invalid reason." }, { status: 400 });
  }

  // Get reporter (optional — anonymous reports are allowed)
  const supabase = await createSupabaseRouteClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Safety: verify the theme exists
  const { data: theme } = await supabaseAdmin
    .from("themes")
    .select("id, status")
    .eq("id", themeId)
    .maybeSingle();
  if (!theme) return NextResponse.json({ error: "Theme not found." }, { status: 404 });
  if (theme.status === "removed" || theme.status === "banned_creator") {
    return NextResponse.json({ error: "This theme has already been removed." }, { status: 410 });
  }

  const { error } = await supabaseAdmin.from("theme_reports").insert({
    theme_id: themeId,
    reporter_id: user?.id ?? null,
    reason,
    details: details ? String(details).trim().slice(0, 1000) : null,
  });

  if (error) {
    return NextResponse.json({ error: "Failed to submit report." }, { status: 500 });
  }

  // Increment total_reports on creator's marketplace profile
  if (theme) {
    const { data: themeRow } = await supabaseAdmin
      .from("themes")
      .select("user_id")
      .eq("id", themeId)
      .maybeSingle();
    if (themeRow?.user_id) {
      await supabaseAdmin.rpc("increment_creator_progress" as unknown as never, {
        p_user_id: themeRow.user_id,
        p_col: "total_reports",
        p_amount: 1,
      }).then(null, () => {
        // Non-critical — ignore if RPC doesn't exist yet
      });
    }
  }

  return NextResponse.json({ ok: true });
}
