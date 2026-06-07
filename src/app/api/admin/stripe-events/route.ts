import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

const OWNER_ROLES = ["owner", "co_owner"];

const PAGE_SIZE = 50;

// Severity classification for display
const CRITICAL_TYPES = new Set([
  "transfer.reversed",
  "payout.failed",
  "charge.dispute.created",
  "account.application.deauthorized",
]);
const HIGH_TYPES = new Set([
  "charge.dispute.updated",
  "charge.dispute.closed",
  "payment_intent.payment_failed",
  "account.updated",
  "review.opened",
]);

function getSeverity(type: string): "critical" | "high" | "info" {
  if (CRITICAL_TYPES.has(type)) return "critical";
  if (HIGH_TYPES.has(type)) return "high";
  return "info";
}

/**
 * GET /api/admin/stripe-events
 * Query params:
 *   tab        — "processed" | "failed"   (default: "processed")
 *   type       — filter by event type
 *   severity   — filter by severity: "critical" | "high" | "info"
 *   account_id — filter by stripe_account_id
 *   cursor     — pagination cursor (processed_at ISO for processed, last_failed_at for failed)
 *   limit      — max results (default 50, max 100)
 */
export async function GET(req: Request) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!OWNER_ROLES.includes(admin.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const tab = url.searchParams.get("tab") ?? "processed";
  const typeFilter = url.searchParams.get("type") ?? "";
  const severityFilter = url.searchParams.get("severity") ?? "";
  const accountFilter = url.searchParams.get("account_id") ?? "";
  const cursor = url.searchParams.get("cursor") ?? "";
  const limit = Math.min(Number(url.searchParams.get("limit") || PAGE_SIZE), 100);

  try {
    if (tab === "failed") {
      let query = supabaseAdmin
        .from("stripe_failed_webhook_events")
        .select(`
          event_id, event_type, stripe_account_id, stripe_object_id,
          affected_user_id, payload, status, failure_count, retry_count,
          first_failed_at, last_failed_at, last_error_message,
          last_replayed_at, resolved_at, created_at
        `)
        .order("last_failed_at", { ascending: false })
        .limit(limit + 1);

      if (typeFilter) query = query.eq("event_type", typeFilter);
      if (accountFilter) query = query.eq("stripe_account_id", accountFilter);
      if (cursor) query = query.lt("last_failed_at", cursor);

      const { data, error } = await query;
      if (error) return NextResponse.json({ error: "Query failed" }, { status: 500 });

      const rows = data ?? [];
      const hasMore = rows.length > limit;
      const events = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? events[events.length - 1].last_failed_at : null;

      // Enrich with user display info
      const userIds = [...new Set(events.map((e) => e.affected_user_id).filter(Boolean))] as string[];
      const userMap: Record<string, { display_name: string | null; username: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("user_id, display_name, username")
          .in("user_id", userIds);
        for (const p of profiles ?? []) {
          userMap[p.user_id] = { display_name: p.display_name, username: p.username };
        }
      }

      const enriched = events.map((e) => ({
        ...e,
        severity: getSeverity(e.event_type),
        user: e.affected_user_id ? userMap[e.affected_user_id] ?? null : null,
      }));

      // Summary counts
      const { count: totalFailed } = await supabaseAdmin
        .from("stripe_failed_webhook_events")
        .select("event_id", { count: "exact", head: true })
        .neq("status", "replayed_success");

      const { count: totalCritical } = await supabaseAdmin
        .from("stripe_failed_webhook_events")
        .select("event_id", { count: "exact", head: true })
        .in("event_type", [...CRITICAL_TYPES])
        .neq("status", "replayed_success");

      return NextResponse.json({
        events: enriched,
        hasMore,
        nextCursor,
        summary: { total_failed: totalFailed ?? 0, total_critical: totalCritical ?? 0 },
      });
    }

    // ── Processed events tab ──
    // stripe_webhook_events only has id, type, processed_at — so we enrich from payload in failed table
    // For the live feed we do a combined view: all processed events ordered by time
    let query = supabaseAdmin
      .from("stripe_webhook_events")
      .select("id, type, processed_at")
      .order("processed_at", { ascending: false })
      .limit(limit + 1);

    if (typeFilter) query = query.eq("type", typeFilter);
    if (cursor) query = query.lt("processed_at", cursor);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: "Query failed" }, { status: 500 });

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const events = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? events[events.length - 1].processed_at : null;

    // For processed events, try to get payload from failed table if it exists there too
    const eventIds = events.map((e) => e.id);
    const payloadMap: Record<string, { stripe_account_id: string | null; stripe_object_id: string | null; affected_user_id: string | null; payload: Record<string, unknown> | null }> = {};
    if (eventIds.length > 0) {
      const { data: failedRows } = await supabaseAdmin
        .from("stripe_failed_webhook_events")
        .select("event_id, stripe_account_id, stripe_object_id, affected_user_id, payload")
        .in("event_id", eventIds);
      for (const r of failedRows ?? []) {
        payloadMap[r.event_id] = {
          stripe_account_id: r.stripe_account_id,
          stripe_object_id: r.stripe_object_id,
          affected_user_id: r.affected_user_id,
          payload: r.payload,
        };
      }
    }

    // Apply account filter on enriched data (can't do it on base table)
    let enriched = events.map((e) => {
      const extra = payloadMap[e.id] ?? null;
      return {
        event_id: e.id,
        event_type: e.type,
        processed_at: e.processed_at,
        stripe_account_id: extra?.stripe_account_id ?? null,
        stripe_object_id: extra?.stripe_object_id ?? null,
        affected_user_id: extra?.affected_user_id ?? null,
        severity: getSeverity(e.type),
      };
    });

    if (accountFilter) {
      enriched = enriched.filter((e) => e.stripe_account_id === accountFilter);
    }
    if (severityFilter) {
      enriched = enriched.filter((e) => e.severity === severityFilter);
    }

    // Summary counts
    const { count: totalProcessed } = await supabaseAdmin
      .from("stripe_webhook_events")
      .select("id", { count: "exact", head: true });

    const { count: totalFailed } = await supabaseAdmin
      .from("stripe_failed_webhook_events")
      .select("event_id", { count: "exact", head: true })
      .neq("status", "replayed_success");

    const { count: totalCritical } = await supabaseAdmin
      .from("stripe_failed_webhook_events")
      .select("event_id", { count: "exact", head: true })
      .in("event_type", [...CRITICAL_TYPES])
      .neq("status", "replayed_success");

    return NextResponse.json({
      events: enriched,
      hasMore,
      nextCursor,
      summary: {
        total_processed: totalProcessed ?? 0,
        total_failed: totalFailed ?? 0,
        total_critical: totalCritical ?? 0,
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
