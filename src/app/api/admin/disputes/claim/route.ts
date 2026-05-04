import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";
import { logDisputeEvent } from "@/lib/disputeEvents";

export const runtime = "nodejs";

/**
 * POST — Claim a dispute case (only one admin can hold it).
 * DELETE — Release a claimed case (only the claimant or an owner can release).
 */
export async function POST(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(session.role, "view_admin");

    const { dispute_id } = await req.json();
    if (!dispute_id || typeof dispute_id !== "string") {
      return NextResponse.json({ error: "Missing dispute_id" }, { status: 400 });
    }

    // Verify the dispute exists and is still active
    const { data: tip } = await supabaseAdmin
      .from("tip_intents")
      .select("receipt_id")
      .eq("receipt_id", dispute_id)
      .eq("status", "disputed")
      .maybeSingle();

    if (!tip) {
      return NextResponse.json({ error: "Dispute not found or already resolved" }, { status: 404 });
    }

    // Insert — unique(dispute_id) prevents double-claiming
    const { error } = await supabaseAdmin
      .from("dispute_assignments")
      .insert({
        dispute_id,
        admin_id: session.userId,
      });

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Already claimed by another admin" }, { status: 409 });
      }
      return NextResponse.json({ error: "Failed to claim dispute." }, { status: 500 });
    }

    await logDisputeEvent(supabaseAdmin, dispute_id, "claim", "Claimed the case", session.userId);

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(session.role, "view_admin");

    const { dispute_id } = await req.json();
    if (!dispute_id || typeof dispute_id !== "string") {
      return NextResponse.json({ error: "Missing dispute_id" }, { status: 400 });
    }

    // Only the claimant or an owner can release
    const { data: assignment } = await supabaseAdmin
      .from("dispute_assignments")
      .select("admin_id")
      .eq("dispute_id", dispute_id)
      .maybeSingle();

    if (!assignment) {
      return NextResponse.json({ error: "No claim found for this dispute" }, { status: 404 });
    }

    if (assignment.admin_id !== session.userId && session.role !== "owner") {
      return NextResponse.json({ error: "Only the claimant or an owner can release a case" }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from("dispute_assignments")
      .delete()
      .eq("dispute_id", dispute_id);

    if (error) {
      return NextResponse.json({ error: "Failed to release dispute claim." }, { status: 500 });
    }
    const isOwnerRelease = assignment.admin_id !== session.userId;
    await logDisputeEvent(
      supabaseAdmin,
      dispute_id,
      "release",
      isOwnerRelease ? "Case released by owner" : "Released the case",
      session.userId,
    );

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
