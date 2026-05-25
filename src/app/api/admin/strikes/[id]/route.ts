import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

// ── PATCH /api/admin/strikes/[id] ──────────────────────────────────────────
// Update strike status: appealed | removed | expired
// Also supports updating notes.
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    try { requireRole(session.role, "moderator"); } catch {
      return NextResponse.json({ error: "Requires moderator role" }, { status: 403 });
    }

    const { id } = params;
    if (!id) return NextResponse.json({ error: "Strike ID required" }, { status: 400 });

    const body = await req.json();
    const { status, notes } = body;

    const allowedStatuses = ["active", "appealed", "removed", "expired"];
    if (status && !allowedStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    // Fetch existing strike to verify it exists and get creator_id for recalc
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("creator_strikes")
      .select("id, creator_id, status")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Strike not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    if (status !== undefined) updates.status = status;
    if (notes  !== undefined) updates.notes  = notes?.trim() ?? null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("creator_strikes")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Recalculate risk level if status changed (affects point total)
    if (status !== undefined && status !== existing.status) {
      await supabaseAdmin.rpc("recalculate_creator_risk", { p_creator_id: existing.creator_id });
    }

    // Return updated profile risk summary
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("creator_strike_points, creator_risk_level, marketplace_disabled")
      .eq("user_id", existing.creator_id)
      .single();

    return NextResponse.json({
      strike: updated,
      creator_risk_level:    profile?.creator_risk_level ?? "normal",
      creator_strike_points: profile?.creator_strike_points ?? 0,
      marketplace_disabled:  profile?.marketplace_disabled ?? false,
    });
  } catch (err) {
    console.error("[PATCH /api/admin/strikes/[id]]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ── GET /api/admin/strikes/[id] ────────────────────────────────────────────
// Fetch a single strike with creator profile context.
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

    const { id } = params;
    const { data: strike, error } = await supabaseAdmin
      .from("creator_strikes")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !strike) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("user_id, handle, display_name, email, creator_strike_points, creator_risk_level, marketplace_disabled")
      .eq("user_id", strike.creator_id)
      .single();

    return NextResponse.json({ strike, creator_profile: profile ?? null });
  } catch (err) {
    console.error("[GET /api/admin/strikes/[id]]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
