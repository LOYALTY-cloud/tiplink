import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(session.role, "view_admin");

    const { searchParams } = new URL(req.url);
    const statusParam = (searchParams.get("status") || "active").toLowerCase();

    let query = supabaseAdmin
      .from("tip_intents")
      .select(
        "receipt_id, creator_user_id, tip_amount, refunded_amount, refund_status, stripe_payment_intent_id, status, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (statusParam === "active") {
      query = query.eq("status", "disputed");
    } else if (statusParam === "resolved") {
      query = query.in("status", ["dispute_resolved", "dispute_countered"]);
    } else if (statusParam === "all") {
      query = query.in("status", ["disputed", "dispute_resolved", "dispute_countered"]);
    } else if (["disputed", "dispute_resolved", "dispute_countered"].includes(statusParam)) {
      query = query.eq("status", statusParam);
    } else {
      query = query.eq("status", "disputed");
    }

    const { data, error } = await query;

    if (error) return NextResponse.json({ error: "Failed to load disputes." }, { status: 500 });
    const disputes = data ?? [];

    // Fetch claim assignments for all disputes
    const receiptIds = disputes.map((d) => d.receipt_id);
    const assignments: Record<string, string> = {};
    if (receiptIds.length > 0) {
      const { data: assignData } = await supabaseAdmin
        .from("dispute_assignments")
        .select("dispute_id, admin_id")
        .in("dispute_id", receiptIds);
      for (const a of assignData ?? []) {
        assignments[a.dispute_id] = a.admin_id;
      }
    }

    // Batch-fetch profiles for creator IDs
    const ids = [...new Set(disputes.map((d) => d.creator_user_id))];

    // Also include claimed admin IDs for profile resolution
    const claimedAdminIds = Object.values(assignments);
    const allProfileIds = [...new Set([...ids, ...claimedAdminIds])];
    const profiles: Record<string, { handle: string | null; display_name: string | null }> = {};
    if (allProfileIds.length > 0) {
      const { data: profileData } = await supabaseAdmin
        .from("profiles")
        .select("user_id, handle, display_name")
        .in("user_id", allProfileIds);
      for (const p of profileData ?? []) {
        profiles[p.user_id] = { handle: p.handle, display_name: p.display_name };
      }
    }

    return NextResponse.json({ data: disputes, profiles, assignments });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
