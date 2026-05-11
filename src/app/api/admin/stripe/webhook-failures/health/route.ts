import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

type FailureRow = {
  event_id: string;
  event_type: string;
  stripe_account_id: string | null;
  affected_user_id: string | null;
  status: "failed" | "replay_failed" | "replayed_success";
  failure_count: number;
  retry_count: number;
  first_failed_at: string;
  last_failed_at: string;
  last_error_message: string | null;
};

export async function GET(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(session.role, ["owner", "super_admin", "finance_admin", "support_admin"]);

    const url = new URL(req.url);
    const includeRecent = url.searchParams.get("include_recent") !== "false";
    const rawRecentLimit = Number(url.searchParams.get("recent_limit") ?? 25);
    const recentLimit = Number.isFinite(rawRecentLimit)
      ? Math.max(1, Math.min(100, Math.floor(rawRecentLimit)))
      : 25;

    const unresolvedStatuses = ["failed", "replay_failed"];

    const [
      { count: failedCount, error: failedCountErr },
      { count: replayFailedCount, error: replayFailedCountErr },
      { count: queuedTotalCount, error: queuedTotalErr },
      { data: oldestRow, error: oldestErr },
      { data: unresolvedRows, error: unresolvedErr },
      recentRes,
    ] = await Promise.all([
      supabaseAdmin
        .from("stripe_failed_webhook_events")
        .select("event_id", { count: "exact", head: true })
        .in("status", unresolvedStatuses),
      supabaseAdmin
        .from("stripe_failed_webhook_events")
        .select("event_id", { count: "exact", head: true })
        .eq("status", "replay_failed"),
      supabaseAdmin
        .from("stripe_failed_webhook_events")
        .select("event_id", { count: "exact", head: true }),
      supabaseAdmin
        .from("stripe_failed_webhook_events")
        .select("first_failed_at")
        .in("status", unresolvedStatuses)
        .order("first_failed_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("stripe_failed_webhook_events")
        .select("retry_count, failure_count")
        .in("status", unresolvedStatuses)
        .order("last_failed_at", { ascending: false })
        .limit(5000),
      includeRecent
        ? supabaseAdmin
            .from("stripe_failed_webhook_events")
            .select("event_id, event_type, stripe_account_id, affected_user_id, status, failure_count, retry_count, first_failed_at, last_failed_at, last_error_message")
            .in("status", unresolvedStatuses)
            .order("last_failed_at", { ascending: false })
            .limit(recentLimit)
        : Promise.resolve({ data: [], error: null } as { data: FailureRow[] | null; error: null }),
    ]);

    if (failedCountErr || replayFailedCountErr || queuedTotalErr || oldestErr || unresolvedErr || recentRes.error) {
      return NextResponse.json({ error: "Failed to load webhook health" }, { status: 500 });
    }

    const oldestFailedAt = oldestRow?.first_failed_at ?? null;
    const oldestAgeSeconds = oldestFailedAt
      ? Math.max(0, Math.floor((Date.now() - new Date(oldestFailedAt).getTime()) / 1000))
      : null;

    const unresolved = unresolvedRows ?? [];
    const retryCount = unresolved.reduce((sum, row) => sum + Number(row.retry_count ?? 0), 0);
    const failureCount = unresolved.reduce((sum, row) => sum + Number(row.failure_count ?? 0), 0);

    return NextResponse.json({
      ok: true,
      metrics: {
        failed_count: failedCount ?? 0,
        replay_failed_count: replayFailedCount ?? 0,
        queued_total_count: queuedTotalCount ?? 0,
        retry_count: retryCount,
        cumulative_failure_count: failureCount,
        oldest_failed_at: oldestFailedAt,
        oldest_failed_age_seconds: oldestAgeSeconds,
      },
      recent: includeRecent ? (recentRes.data ?? []) : [],
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
