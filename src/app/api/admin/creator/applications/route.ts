import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

/**
 * GET /api/admin/creator/applications?status=pending&page=0
 * Lists creator applications for admin review.
 */
export async function GET(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(session.role, "view_admin");

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status") || "pending";
    const page = Math.max(0, parseInt(searchParams.get("page") || "0", 10));
    const pageSize = 25;

    const [itemsResult, pendingCount, approvedCount, rejectedCount] = await Promise.all([
      supabaseAdmin
        .from("creator_applications")
        .select("id, user_id, username, social_links, description, audience_size, status, review_notes, created_at, reviewed_at")
        .eq("status", statusFilter)
        .order("created_at", { ascending: statusFilter === "pending" })
        .range(page * pageSize, (page + 1) * pageSize - 1),

      supabaseAdmin.from("creator_applications").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabaseAdmin.from("creator_applications").select("id", { count: "exact", head: true }).eq("status", "approved"),
      supabaseAdmin.from("creator_applications").select("id", { count: "exact", head: true }).eq("status", "rejected"),
    ]);

    // Enrich with profile data
    const items = itemsResult.data ?? [];
    const userIds = [...new Set(items.map((a) => a.user_id))];
    let profiles: Array<{ user_id: string; handle: string | null; display_name: string | null; email: string | null; avatar_url: string | null }> = [];

    if (userIds.length > 0) {
      const { data: profData } = await supabaseAdmin
        .from("profiles")
        .select("user_id, handle, display_name, email, avatar_url")
        .in("user_id", userIds);
      profiles = (profData ?? []) as typeof profiles;
    }

    const profileMap = Object.fromEntries(profiles.map((p) => [p.user_id, p]));
    const enriched = items.map((a) => ({ ...a, profile: profileMap[a.user_id] ?? null }));

    return NextResponse.json({
      applications: enriched,
      counts: {
        pending: pendingCount.count ?? 0,
        approved: approvedCount.count ?? 0,
        rejected: rejectedCount.count ?? 0,
      },
      page,
      pageSize,
    });
  } catch (e) {
    console.error("admin/creator/applications GET:", e);
    return NextResponse.json({ error: "Failed to load applications" }, { status: 500 });
  }
}
