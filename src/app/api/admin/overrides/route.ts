import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

type OverrideActivityCountRow = {
  creator_user_id: string;
  dispute_count: number;
  refund_count: number;
};

/**
 * GET /api/admin/overrides
 *
 * Returns paginated override history with optional filters.
 * Query params:
 *   limit   – max rows (default 25, max 100)
 *   cursor  – fetch rows created before this timestamp
 *   archived – when true, return archived rows instead of the active feed
 *   type    – filter by override_type
 *   admin   – filter by admin_id
 *   user    – filter by target_user
 */
export async function GET(req: NextRequest) {
  const session = await getAdminFromRequest(req);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  requireRole(session.role, "risk_eval");

  const params = req.nextUrl.searchParams;
  const rawLimit = Number(params.get("limit") || 25);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 100) : 25;
  const cursor = params.get("cursor");
  const includeArchived = params.get("archived") === "true";
  const typeFilter = params.get("type");
  const adminFilter = params.get("admin");
  const userFilter = params.get("user");
  const tableName = includeArchived ? "admin_overrides_archive" : "admin_overrides";

  let query = supabaseAdmin
    .from(tableName)
    .select("id, admin_id, target_user, override_type, previous_value, new_value, reason, created_at")
    .order("created_at", { ascending: false });

  if (!includeArchived) {
    query = query.eq("is_archived", false);
  }

  if (typeFilter) query = query.eq("override_type", typeFilter);
  if (adminFilter) query = query.eq("admin_id", adminFilter);
  if (userFilter) query = query.eq("target_user", userFilter);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  query = query.limit(limit + 1);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: "Failed to load overrides." }, { status: 500 });
  const hasMore = (data ?? []).length > limit;
  const pageRows = hasMore ? (data ?? []).slice(0, limit) : (data ?? []);
  const nextCursor = hasMore ? pageRows[pageRows.length - 1]?.created_at ?? null : null;

  // Resolve admin + target display names in bulk
  const adminIds = [...new Set(pageRows.map((d) => d.admin_id).filter(Boolean))];
  const userIds = [...new Set(pageRows.map((d) => d.target_user).filter(Boolean))];
  const allIds = [...new Set([...adminIds, ...userIds])];

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("user_id, display_name, handle, first_name, last_name")
    .in("user_id", allIds.length > 0 ? allIds : ["__none__"]);

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.user_id, { display_name: p.display_name, handle: p.handle, first_name: p.first_name, last_name: p.last_name }])
  );

  // Fetch activity counts for all target users in bulk (DB-side aggregation).
  const uniqueTargetUsers = [...new Set(pageRows.map((d) => d.target_user).filter(Boolean))];

  const activityCountMap = new Map<string, { dispute_count: number; refund_count: number }>();
  const disputePreviewMap = new Map<string, Array<{ receipt_id: string; tip_amount: number; refunded_amount: number; refund_status: string; status: string; created_at: string }>>();

  if (uniqueTargetUsers.length > 0) {
    const { data: activityCountRows, error: activityCountError } = await supabaseAdmin.rpc(
      "get_override_user_activity_counts",
      { user_ids: uniqueTargetUsers }
    );

    if (activityCountError) {
      return NextResponse.json({ error: activityCountError.message }, { status: 500 });
    }

    for (const row of (activityCountRows ?? []) as OverrideActivityCountRow[]) {
      activityCountMap.set(row.creator_user_id, {
        dispute_count: Number(row.dispute_count ?? 0),
        refund_count: Number(row.refund_count ?? 0),
      });
    }
  }

  if (uniqueTargetUsers.length > 0) {
    const { data: disputedTips } = await supabaseAdmin
      .from("tip_intents")
      .select("receipt_id, creator_user_id, tip_amount, refunded_amount, refund_status, status, created_at")
      .in("creator_user_id", uniqueTargetUsers)
      .eq("status", "disputed")
      .order("created_at", { ascending: false })
      .limit(200);

    for (const dt of disputedTips ?? []) {
      const existing = disputePreviewMap.get(dt.creator_user_id) ?? [];
      existing.push(dt);
      disputePreviewMap.set(dt.creator_user_id, existing);
    }
  }

  const enriched = pageRows.map((row) => {
    const adminProfile = profileMap.get(row.admin_id);
    const targetProfile = profileMap.get(row.target_user);
    const activityCounts = activityCountMap.get(row.target_user) ?? { dispute_count: 0, refund_count: 0 };
    const disputePreviews = disputePreviewMap.get(row.target_user) ?? [];

    function resolveName(p: typeof adminProfile, fallbackId: string): string {
      if (!p) return fallbackId;
      if (p.display_name) return p.display_name;
      if (p.first_name && p.last_name) return `${p.first_name} ${p.last_name}`;
      if (p.first_name) return p.first_name;
      if (p.handle) return `@${p.handle}`;
      return fallbackId;
    }

    return {
      ...row,
      admin_name: resolveName(adminProfile, row.admin_id),
      target_name: resolveName(targetProfile, row.target_user),
      disputes: disputePreviews,
      dispute_count: activityCounts.dispute_count,
      refund_count: activityCounts.refund_count,
    };
  });

  return NextResponse.json({
    data: enriched,
    next_cursor: nextCursor,
  });
}
