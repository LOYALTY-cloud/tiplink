import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";
import { STRIKE_POINTS } from "@/types/strikes";
import type { StrikeSeverity, IssueStrikePayload } from "@/types/strikes";

export const runtime = "nodejs";

const PAGE_SIZE = 50;

// ── GET /api/admin/strikes ─────────────────────────────────────────────────
// Query params: creator_id, severity, status, page
export async function GET(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    try { requireRole(session.role, "staff"); } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const creator_id = searchParams.get("creator_id");
    const severity   = searchParams.get("severity");
    const status     = searchParams.get("status") ?? "active";
    const page       = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));

    let query = supabaseAdmin
      .from("creator_strikes")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (creator_id) query = query.eq("creator_id", creator_id);
    if (severity)   query = query.eq("severity", severity);
    if (status !== "all") query = query.eq("status", status);

    const { data: strikes, count, error } = await query;
    if (error) throw error;

    // Enrich with creator + issuer profiles in bulk
    const creatorIds = [...new Set((strikes ?? []).map((s) => s.creator_id))];
    const issuerIds  = [...new Set((strikes ?? []).map((s) => s.issued_by).filter(Boolean))];

    const [creatorProfiles, issuerProfiles] = await Promise.all([
      creatorIds.length
        ? supabaseAdmin.from("profiles").select("user_id, handle, display_name, email").in("user_id", creatorIds)
        : { data: [] },
      issuerIds.length
        ? supabaseAdmin.from("profiles").select("id, handle, display_name, email").in("id", issuerIds as string[])
        : { data: [] },
    ]);

    const creatorMap = new Map((creatorProfiles.data ?? []).map((p) => [p.user_id, p]));
    const issuerMap  = new Map((issuerProfiles.data  ?? []).map((p) => [p.id, p]));

    const enriched = (strikes ?? []).map((s) => ({
      ...s,
      creator_handle:  creatorMap.get(s.creator_id)?.handle ?? null,
      creator_display: creatorMap.get(s.creator_id)?.display_name ?? null,
      creator_email:   creatorMap.get(s.creator_id)?.email ?? null,
      issuer_handle:   s.issued_by ? (issuerMap.get(s.issued_by)?.handle ?? null) : null,
      issuer_display:  s.issued_by ? (issuerMap.get(s.issued_by)?.display_name ?? null) : null,
    }));

    return NextResponse.json({ strikes: enriched, total: count ?? 0, page });
  } catch (err) {
    console.error("[GET /api/admin/strikes]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ── POST /api/admin/strikes ────────────────────────────────────────────────
// Issue a new strike against a creator.
export async function POST(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    try { requireRole(session.role, "moderator"); } catch {
      return NextResponse.json({ error: "Requires moderator role" }, { status: 403 });
    }

    const body: IssueStrikePayload = await req.json();
    const { creator_id, severity, reason, notes, theme_id, expires_at, related_dmca_id, related_report_id } = body;

    if (!creator_id || !severity || !reason) {
      return NextResponse.json({ error: "creator_id, severity, and reason are required" }, { status: 400 });
    }
    if (!["warning", "minor", "major", "critical"].includes(severity)) {
      return NextResponse.json({ error: "Invalid severity" }, { status: 400 });
    }
    if (reason.trim().length < 5) {
      return NextResponse.json({ error: "Reason must be at least 5 characters" }, { status: 400 });
    }

    // Resolve admin's profile id for issued_by
    const { data: adminProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", session.userId)
      .single();

    const points = STRIKE_POINTS[severity as StrikeSeverity];

    const insertPayload: Record<string, unknown> = {
      creator_id,
      severity,
      reason: reason.trim(),
      notes: notes?.trim() ?? null,
      strike_points: points,
      status: "active",
      issued_by: adminProfile?.id ?? null,
      expires_at: expires_at ?? null,
    };
    if (theme_id)         insertPayload.theme_id = theme_id;
    if (related_dmca_id)  insertPayload.related_dmca_id = related_dmca_id;
    if (related_report_id) insertPayload.related_report_id = related_report_id;

    const { data: strike, error } = await supabaseAdmin
      .from("creator_strikes")
      .insert(insertPayload)
      .select()
      .single();

    if (error) throw error;

    // Trigger recalculation (the DB trigger handles it, but call explicitly as a fallback)
    await supabaseAdmin.rpc("recalculate_creator_risk", { p_creator_id: creator_id });

    // Fetch updated risk level for response
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("creator_strike_points, creator_risk_level, marketplace_disabled")
      .eq("user_id", creator_id)
      .single();

    return NextResponse.json({
      strike,
      creator_risk_level:    profile?.creator_risk_level ?? "normal",
      creator_strike_points: profile?.creator_strike_points ?? points,
      marketplace_disabled:  profile?.marketplace_disabled ?? false,
    }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/admin/strikes]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
