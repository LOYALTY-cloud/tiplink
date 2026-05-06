import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

/**
 * GET /api/admin/marketplace/queue
 * Returns themes needing moderation, grouped by queue type.
 */
export async function GET(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(session.role, ["owner", "super_admin", "admin", "moderator"]);

    const { searchParams } = new URL(req.url);
    const queue = searchParams.get("queue") ?? "pending";
    const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);

    let statusFilter: string[];
    switch (queue) {
      case "flagged":   statusFilter = ["flagged"]; break;
      case "removed":   statusFilter = ["removed", "banned_creator"]; break;
      case "all":       statusFilter = ["pending_review", "flagged", "removed", "banned_creator"]; break;
      default:          statusFilter = ["pending_review"]; break;
    }

    const { data: themes, error } = await supabaseAdmin
      .from("themes")
      .select(`
        id, name, description, category, tags, status, risk_score,
        moderation_reason, duplicate_warning, preview_images,
        created_at, user_id,
        creator:profiles!themes_user_id_fkey (
          display_name, handle, avatar_url
        )
      `)
      .in("status", statusFilter)
      .order("risk_score", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) return NextResponse.json({ error: "Failed to load queue." }, { status: 500 });

    // Count per queue tab
    const { data: counts } = await supabaseAdmin
      .from("themes")
      .select("status")
      .in("status", ["pending_review", "flagged"]);

    const pending = (counts ?? []).filter((t: { status: string }) => t.status === "pending_review").length;
    const flagged = (counts ?? []).filter((t: { status: string }) => t.status === "flagged").length;

    // Attach report + dmca counts
    const themeIds = (themes ?? []).map((t: { id: string }) => t.id);
    const { data: reports } = await supabaseAdmin
      .from("theme_reports")
      .select("theme_id")
      .in("theme_id", themeIds)
      .eq("status", "pending");

    const reportCounts: Record<string, number> = {};
    for (const r of reports ?? []) {
      reportCounts[r.theme_id] = (reportCounts[r.theme_id] ?? 0) + 1;
    }

    const { data: dmcas } = await supabaseAdmin
      .from("dmca_claims")
      .select("theme_id")
      .in("theme_id", themeIds)
      .eq("status", "pending");

    const dmcaCounts: Record<string, number> = {};
    for (const d of dmcas ?? []) {
      if (d.theme_id) dmcaCounts[d.theme_id] = (dmcaCounts[d.theme_id] ?? 0) + 1;
    }

    const enriched = (themes ?? []).map((t: Record<string, unknown>) => ({
      ...t,
      report_count: reportCounts[t.id as string] ?? 0,
      dmca_count: dmcaCounts[t.id as string] ?? 0,
    }));

    return NextResponse.json({ themes: enriched, counts: { pending, flagged } });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }
}
