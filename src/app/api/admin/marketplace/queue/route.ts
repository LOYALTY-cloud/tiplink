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
    const q = searchParams.get("q")?.trim() ?? "";
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // ── Handle / @handle search ────────────────────────────────────────────────
    // If q is non-empty and NOT a UUID, treat it as a creator @handle lookup.
    if (q && !UUID_RE.test(q)) {
      const handleRaw = q.startsWith("@") ? q.slice(1) : q;

      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("user_id, display_name, handle, avatar_url, store_disabled")
        .ilike("handle", handleRaw)
        .maybeSingle();

      if (!profile) {
        return NextResponse.json({
          themes: [],
          creator_filter: null,
          counts: { pending: 0, flagged: 0 },
          not_found: true,
        });
      }

      const { data: themes, error: themesErr } = await supabaseAdmin
        .from("themes")
        .select(`
          id, name, description, category, tags, status, risk_score,
          moderation_reason, duplicate_warning, preview_images,
          created_at, user_id
        `)
        .eq("user_id", profile.user_id)
        .order("created_at", { ascending: false });

      if (themesErr) {
        console.error("[queue] handle themes query error:", JSON.stringify(themesErr));
      }

      const themeIds = (themes ?? []).map((t: { id: string }) => t.id);

      const { data: reports } = await supabaseAdmin
        .from("theme_reports")
        .select("theme_id")
        .in("theme_id", themeIds.length ? themeIds : ["_none_"])
        .eq("status", "pending");

      const { data: dmcas } = await supabaseAdmin
        .from("dmca_claims")
        .select("theme_id")
        .in("theme_id", themeIds.length ? themeIds : ["_none_"])
        .eq("status", "pending");

      const reportCounts: Record<string, number> = {};
      for (const r of reports ?? []) reportCounts[r.theme_id] = (reportCounts[r.theme_id] ?? 0) + 1;
      const dmcaCounts: Record<string, number> = {};
      for (const d of dmcas ?? []) if (d.theme_id) dmcaCounts[d.theme_id] = (dmcaCounts[d.theme_id] ?? 0) + 1;

      const enriched = (themes ?? []).map((t: Record<string, unknown>) => ({
        ...t,
        creator: {
          display_name: profile.display_name,
          handle: profile.handle,
          avatar_url: profile.avatar_url,
        },
        report_count: reportCounts[t.id as string] ?? 0,
        dmca_count: dmcaCounts[t.id as string] ?? 0,
      }));

      return NextResponse.json({
        themes: enriched,
        creator_filter: {
          user_id: profile.user_id,
          display_name: profile.display_name,
          handle: profile.handle,
          avatar_url: profile.avatar_url,
          store_disabled: profile.store_disabled ?? false,
        },
        counts: { pending: 0, flagged: 0 },
      });
    }

    // ── Direct lookup by theme UUID ────────────────────────────────────────────
    // Used from admin reports "View Theme" jump link
    if (q && UUID_RE.test(q)) {
      const { data: themes } = await supabaseAdmin
        .from("themes")
        .select(`
          id, name, tags, status, risk_score,
          moderation_reason, duplicate_warning, preview_images,
          created_at, user_id
        `)
        .eq("id", q)
        .limit(1);

      const theme = themes?.[0];
      if (!theme) return NextResponse.json({ themes: [], counts: { pending: 0, flagged: 0 } });

      const { data: creatorRow } = await supabaseAdmin
        .from("profiles")
        .select("display_name, handle, avatar_url")
        .eq("user_id", theme.user_id)
        .maybeSingle();

      const { data: reports } = await supabaseAdmin
        .from("theme_reports")
        .select("theme_id")
        .eq("theme_id", q)
        .eq("status", "pending");

      const { data: dmcas } = await supabaseAdmin
        .from("dmca_claims")
        .select("theme_id")
        .eq("theme_id", q)
        .eq("status", "pending");

      const enriched = {
        ...theme,
        creator: creatorRow ?? null,
        report_count: reports?.length ?? 0,
        dmca_count: dmcas?.length ?? 0,
      };
      return NextResponse.json({ themes: [enriched], counts: { pending: 0, flagged: 0 } });
    }

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
        id, name, tags, status, risk_score,
        moderation_reason, duplicate_warning, preview_images,
        created_at, user_id
      `)
      .in("status", statusFilter)
      .order("risk_score", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) {
      console.error("[queue] themes query error:", JSON.stringify(error));
      return NextResponse.json({ error: "Failed to load queue." }, { status: 500 });
    }

    // Count per queue tab
    const { data: counts } = await supabaseAdmin
      .from("themes")
      .select("status")
      .in("status", ["pending_review", "flagged"]);

    const pending = (counts ?? []).filter((t: { status: string }) => t.status === "pending_review").length;
    const flagged = (counts ?? []).filter((t: { status: string }) => t.status === "flagged").length;

    // Fetch creator profiles for all unique user_ids
    const userIds = [...new Set((themes ?? []).map((t: { user_id: string }) => t.user_id))];
    const { data: profileRows } = userIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("user_id, display_name, handle, avatar_url")
          .in("user_id", userIds)
      : { data: [] };

    const profileMap: Record<string, { display_name: string | null; handle: string | null; avatar_url: string | null }> = {};
    for (const p of profileRows ?? []) {
      profileMap[p.user_id] = { display_name: p.display_name, handle: p.handle, avatar_url: p.avatar_url };
    }

    // Attach report + dmca counts
    const themeIds = (themes ?? []).map((t: { id: string }) => t.id);
    const { data: reports } = await supabaseAdmin
      .from("theme_reports")
      .select("theme_id")
      .in("theme_id", themeIds.length ? themeIds : ["_none_"])
      .eq("status", "pending");

    const reportCounts: Record<string, number> = {};
    for (const r of reports ?? []) {
      reportCounts[r.theme_id] = (reportCounts[r.theme_id] ?? 0) + 1;
    }

    const { data: dmcas } = await supabaseAdmin
      .from("dmca_claims")
      .select("theme_id")
      .in("theme_id", themeIds.length ? themeIds : ["_none_"])
      .eq("status", "pending");

    const dmcaCounts: Record<string, number> = {};
    for (const d of dmcas ?? []) {
      if (d.theme_id) dmcaCounts[d.theme_id] = (dmcaCounts[d.theme_id] ?? 0) + 1;
    }

    const enriched = (themes ?? []).map((t: Record<string, unknown>) => ({
      ...t,
      creator: profileMap[t.user_id as string] ?? null,
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
