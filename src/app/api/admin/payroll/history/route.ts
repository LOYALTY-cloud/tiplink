import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

const PAGE_SIZE = 50;

/**
 * GET — List payroll runs with cursor-based pagination.
 * Query params:
 *   cursor  — created_at ISO string; fetch runs older than this
 *   limit   — max results (default 50, max 200)
 */
export async function GET(req: Request) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try { requireRole(admin.role, "payroll"); } catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

    const url = new URL(req.url);
    const cursor = url.searchParams.get("cursor");
    const limit = Math.min(Number(url.searchParams.get("limit") || PAGE_SIZE), 200);

    let query = supabaseAdmin
      .from("payroll_runs")
      .select("id, start_date, end_date, total_amount, status, paid_at, created_at")
      .order("created_at", { ascending: false })
      .limit(limit + 1); // fetch one extra to detect if more exist

    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data } = await query;
    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const runs = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? runs[runs.length - 1].created_at : null;

    return NextResponse.json({ runs, hasMore, nextCursor });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
