import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";

/**
 * GET /api/cron/auto-expire-pending-themes?key=CRON_SECRET
 *
 * Themes that have been in `pending_review` for more than 48 hours with no
 * admin decision are auto-expired back to draft:
 *   - status → 'draft', is_public → false, is_market_active → false
 *   - Creator is notified and can re-activate the theme to re-enter the queue
 *   - An admin_actions row is inserted (admin_id = null = system) so owner
 *     can see cumulative auto-expire counts per period on the staff page
 *
 * Run every 2 hours via Vercel Cron.
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (
    req.headers.get("x-vercel-cron") !== "1" &&
    (!key || key !== process.env.CRON_SECRET)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const EXPIRE_HOURS = 48;
  const cutoff = new Date(Date.now() - EXPIRE_HOURS * 60 * 60 * 1000).toISOString();

  // Fetch all themes in pending_review older than the cutoff
  const { data: stale, error: fetchErr } = await supabaseAdmin
    .from("themes")
    .select("id, name, user_id, created_at")
    .eq("status", "pending_review")
    .lt("updated_at", cutoff);

  if (fetchErr) {
    console.error("[auto-expire-pending-themes] fetch error:", fetchErr);
    return NextResponse.json({ error: "Failed to fetch stale themes" }, { status: 500 });
  }

  if (!stale || stale.length === 0) {
    return NextResponse.json({ expired: 0, message: "No stale pending themes" });
  }

  const ids = stale.map((t) => t.id);

  // Revert themes to draft — creator can re-activate to re-enter queue
  const { error: updateErr } = await supabaseAdmin
    .from("themes")
    .update({
      status: "draft",
      is_public: false,
      is_market_active: false,
      moderation_reason: "Auto-removed: no admin decision within 48 hours. Re-activate to resubmit.",
    })
    .in("id", ids);

  if (updateErr) {
    console.error("[auto-expire-pending-themes] update error:", updateErr);
    return NextResponse.json({ error: "Failed to expire themes" }, { status: 500 });
  }

  // Log each expiry to admin_actions (admin_id null = system action)
  // and write moderation_logs for audit trail
  const now = new Date().toISOString();
  const actionRows = stale.map((t) => ({
    admin_id: null as unknown as string,
    action: "theme_auto_expired",
    target_user: t.user_id,
    metadata: {
      theme_id: t.id,
      theme_name: t.name,
      pending_since: t.created_at,
      expire_hours: EXPIRE_HOURS,
    },
    severity: "low",
    created_at: now,
  }));

  const { error: logErr } = await supabaseAdmin
    .from("admin_actions")
    .insert(actionRows);

  if (logErr) {
    console.error("[auto-expire-pending-themes] admin_actions insert error:", logErr);
    // Non-fatal — themes are already expired
  }

  // Write moderation_logs
  const modRows = stale.map((t) => ({
    theme_id: t.id,
    creator_id: t.user_id,
    event_type: "auto_expired",
    ai_reason: "No admin decision within 48 hours",
    reviewed_by: null,
  }));
  void supabaseAdmin.from("moderation_logs").insert(modRows);

  // Notify each creator (best-effort, non-blocking)
  for (const theme of stale) {
    try {
      await createNotification({
        userId: theme.user_id,
        type: "system",
        title: `"${theme.name}" was removed from the marketplace queue`,
        body: `Your theme was in the review queue for over 48 hours without a decision. It has been moved back to draft. You can re-activate it from your Theme Builder to resubmit for review.`,
        category: "system",
        entityId: theme.id,
      });
    } catch (e) {
      console.error(`[auto-expire-pending-themes] notify failed for user ${theme.user_id}:`, e);
    }
  }

  console.log(`[auto-expire-pending-themes] expired ${stale.length} theme(s)`);
  return NextResponse.json({ expired: stale.length, theme_ids: ids });
}
