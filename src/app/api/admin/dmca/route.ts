import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

const PAGE_SIZE = 25;

export async function GET(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    try { requireRole(session.role, "staff"); } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? "pending";
    const page   = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));

    let query = supabaseAdmin
      .from("dmca_reports")
      .select(
        "id, first_name, last_name, email, organization, infringing_content_url, status, priority, created_at, reviewed_at, moderator_notes",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data, count, error } = await query;
    if (error) return NextResponse.json({ error: "Failed to load reports." }, { status: 500 });

    // Tab counts
    const [pendingCount, reviewingCount, resolvedCount, rejectedCount] = await Promise.all([
      supabaseAdmin.from("dmca_reports").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabaseAdmin.from("dmca_reports").select("id", { count: "exact", head: true }).eq("status", "reviewing"),
      supabaseAdmin.from("dmca_reports").select("id", { count: "exact", head: true }).eq("status", "resolved"),
      supabaseAdmin.from("dmca_reports").select("id", { count: "exact", head: true }).eq("status", "rejected"),
    ]);

    return NextResponse.json({
      reports: data ?? [],
      total: count ?? 0,
      page,
      tabs: {
        pending:   pendingCount.count   ?? 0,
        reviewing: reviewingCount.count ?? 0,
        resolved:  resolvedCount.count  ?? 0,
        rejected:  rejectedCount.count  ?? 0,
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
