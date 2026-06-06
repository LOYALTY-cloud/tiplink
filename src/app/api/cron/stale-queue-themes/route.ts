import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications";
import { createAdminNotification } from "@/lib/adminNotifications";

export const runtime = "nodejs";

const STALE_HOURS = 48;

/**
 * GET /api/cron/stale-queue-themes?key=CRON_SECRET
 *
 * Finds themes that have been sitting in `pending_review` for more than 48 hours
 * with no admin decision. Auto-removes them from the public marketplace:
 *   - status  → "draft"
 *   - is_public → false
 *   - is_market_active → false
 *   - queue_entered_at → null
 *
 * Creators are notified in-app. A system admin_actions entry is logged so owners
 * can see on the staff page how many themes are expiring due to moderator inaction.
 *
 * Run on a schedule (every 6 hours via Vercel Cron).
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (
    req.headers.get("x-vercel-cron") !== "1" &&
    (!key || key !== process.env.CRON_SECRET)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000).toISOString();

  // Find stale themes
  const { data: stale, error: fetchErr } = await supabaseAdmin
    .from("themes")
    .select("id, name, user_id, queue_entered_at")
    .eq("status", "pending_review")
    .not("queue_entered_at", "is", null)
    .lt("queue_entered_at", cutoff);

  if (fetchErr) {
    console.error("[stale-queue-themes] fetch error:", fetchErr);
    return NextResponse.json({ error: "Failed to fetch stale themes" }, { status: 500 });
  }

  if (!stale || stale.length === 0) {
    return NextResponse.json({ removed: 0, message: "No stale themes in queue" });
  }

  const ids = stale.map((t) => t.id);

  // Auto-remove: pull from public marketplace, reset to draft
  const { error: updateErr } = await supabaseAdmin
    .from("themes")
    .update({
      status: "draft",
      is_public: false,
      is_market_active: false,
      queue_entered_at: null,
      moderation_reason: `Auto-removed: no admin decision within ${STALE_HOURS} hours. Creator may resubmit.`,
    })
    .in("id", ids);

  if (updateErr) {
    console.error("[stale-queue-themes] update error:", updateErr);
    return NextResponse.json({ error: "Failed to auto-remove themes" }, { status: 500 });
  }

  // Log system action for each theme (counted on staff page per-theme, owner-visible)
  const systemActions = stale.map((t) => ({
    admin_id: null as string | null,
    action: "marketplace_theme_auto_removed",
    target_user: t.user_id,
    metadata: {
      theme_id: t.id,
      theme_name: t.name,
      queue_entered_at: t.queue_entered_at,
      stale_hours: STALE_HOURS,
      reason: "No admin decision within 48 hours",
    },
    severity: "medium",
  }));

  await supabaseAdmin.from("admin_actions").insert(systemActions).then(null, (e) =>
    console.error("[stale-queue-themes] admin_actions insert error:", e)
  );

  // Notify each creator in-app (best-effort, non-blocking)
  const notifyCreators = stale.map((t) =>
    createNotification({
      userId: t.user_id,
      type: "theme_rejected",
      title: `"${t.name}" was removed from the queue`,
      body: `Your theme was automatically removed from the marketplace queue after ${STALE_HOURS} hours with no admin decision. You can reactivate it for sale any time from your Theme Builder — it will re-enter the review queue.`,
      category: "system",
      entityId: t.id,
      skipEmail: false,
    }).catch((e) => console.error(`[stale-queue-themes] notify creator ${t.user_id}:`, e))
  );

  await Promise.allSettled(notifyCreators);

  // Notify owner/super_admin that themes were auto-removed (batch summary)
  await createAdminNotification({
    type: "marketplace_alert",
    title: `${stale.length} theme${stale.length > 1 ? "s" : ""} auto-removed from queue`,
    message: `${stale.length} theme${stale.length > 1 ? "s" : ""} were automatically removed from the marketplace queue after ${STALE_HOURS} hours with no moderation decision. Creators have been notified. Review moderator activity on the Staff page.`,
    link: "/admin/staff",
    requiresAction: true,
    priority: "high",
    visibility: "role",
    roleTarget: ["owner", "co_owner", "super_admin"],
    metadata: {
      auto_removed_count: stale.length,
      theme_ids: ids,
      stale_hours: STALE_HOURS,
    },
  }).catch((e) => console.error("[stale-queue-themes] owner notification error:", e));

  console.log(`[stale-queue-themes] auto-removed ${stale.length} stale theme(s)`);
  return NextResponse.json({ removed: stale.length, theme_ids: ids });
}
