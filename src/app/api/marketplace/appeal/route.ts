import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createAdminNotification } from "@/lib/adminNotifications";

export const runtime = "nodejs";

/**
 * POST /api/marketplace/appeal
 * Creator submits an appeal for a flagged/removed theme.
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  // Fetch creator handle for the notification message
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("handle, display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const creatorName = profile?.display_name || profile?.handle || user.email || user.id;

  // Notify admins/moderators
  await createAdminNotification({
    type: "marketplace_alert",
    title: "New Theme Appeal",
    message: `${creatorName} appealed the rejection of theme ${themeId}. Reason: ${reason.slice(0, 120)}${reason.length > 120 ? "…" : ""}`,
    link: "/admin/marketplace/appeals",
    requiresAction: true,
    priority: "medium",
    metadata: { theme_id: themeId, user_id: user.id, creator: creatorName },
  });

  return NextResponse.json({ success: true });
}
