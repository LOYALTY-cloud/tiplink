import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

// ── GET /api/admin/creators/[id]/risk ──────────────────────────────────────
// Returns a creator's full strike history and current risk profile.
// [id] is the creator's auth.users UUID.
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    try { requireRole(session.role, "staff"); } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: creator_id } = params;
    if (!creator_id) return NextResponse.json({ error: "Creator ID required" }, { status: 400 });

    const [strikesRes, profileRes] = await Promise.all([
      supabaseAdmin
        .from("creator_strikes")
        .select("*")
        .eq("creator_id", creator_id)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("profiles")
        .select(
          "id, user_id, handle, display_name, email, " +
          "creator_strike_points, creator_risk_level, marketplace_disabled, " +
          "is_frozen, is_flagged, payout_hold_until, account_status"
        )
        .eq("user_id", creator_id)
        .single(),
    ]);

    const strikes = strikesRes.data ?? [];

    // Enrich issued_by names
    const issuerIds = [...new Set(strikes.map((s) => s.issued_by).filter(Boolean))] as string[];
    const { data: issuers } = issuerIds.length
      ? await supabaseAdmin.from("profiles").select("id, handle, display_name").in("id", issuerIds)
      : { data: [] };

    const issuerMap = new Map((issuers ?? []).map((p) => [p.id, p]));

    const enrichedStrikes = strikes.map((s) => ({
      ...s,
      issuer_handle:   s.issued_by ? (issuerMap.get(s.issued_by)?.handle ?? null) : null,
      issuer_display:  s.issued_by ? (issuerMap.get(s.issued_by)?.display_name ?? null) : null,
    }));

    return NextResponse.json({
      creator_profile: profileRes.data ?? null,
      strikes: enrichedStrikes,
      active_strikes:   enrichedStrikes.filter((s) => s.status === "active").length,
      total_strikes:    enrichedStrikes.length,
    });
  } catch (err) {
    console.error("[GET /api/admin/creators/[id]/risk]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
