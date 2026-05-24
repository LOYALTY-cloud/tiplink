import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

const PAGE_SIZE = 30;

/** GET /api/admin/reports — fetch moderation queue */
export async function GET(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    try { requireRole(session.role, "staff"); } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const status      = url.searchParams.get("status") ?? "pending";
    const targetType  = url.searchParams.get("target_type") ?? "";
    const priority    = url.searchParams.get("priority") ?? "";
    const page        = Math.max(0, parseInt(url.searchParams.get("page") ?? "0", 10));

    let query = supabaseAdmin
      .from("reports")
      .select(`
        id,
        reporter_id,
        target_type,
        target_id,
        target_owner_id,
        reason,
        details,
        evidence_urls,
        status,
        priority,
        requires_manual_review,
        moderation_action,
        resolved_notes,
        reviewed_by,
        reviewed_at,
        created_at,
        reporter:profiles!reports_reporter_id_fkey (user_id, display_name, handle, email),
        target_owner:profiles!reports_target_owner_id_fkey (user_id, display_name, handle, email)
      `, { count: "exact" })
      .eq("status", status)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (targetType) query = query.eq("target_type", targetType);
    if (priority)   query = query.eq("priority", priority);

    const { data: reports, count, error } = await query;
    if (error) return NextResponse.json({ error: "Query failed" }, { status: 500 });

    // Pending counts for each status tab
    const [pendingCount, reviewingCount, resolvedCount, dismissedCount] = await Promise.all([
      supabaseAdmin.from("reports").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabaseAdmin.from("reports").select("id", { count: "exact", head: true }).eq("status", "reviewing"),
      supabaseAdmin.from("reports").select("id", { count: "exact", head: true }).eq("status", "resolved"),
      supabaseAdmin.from("reports").select("id", { count: "exact", head: true }).eq("status", "dismissed"),
    ]);

    return NextResponse.json({
      reports: reports ?? [],
      total: count ?? 0,
      page,
      pageSize: PAGE_SIZE,
      tabs: {
        pending:   pendingCount.count   ?? 0,
        reviewing: reviewingCount.count ?? 0,
        resolved:  resolvedCount.count  ?? 0,
        dismissed: dismissedCount.count ?? 0,
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
