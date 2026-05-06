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

    // Exclude admin accounts from all user-facing counts
    const ADMIN_ROLE_VALUES = ["owner", "super_admin", "finance_admin", "support_admin"];

    const [users, restricted, refunds, disputes, owedRows] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .not("role", "in", `(${ADMIN_ROLE_VALUES.map((r) => `"${r}"`).join(",")})`),
      supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .not("role", "in", `(${ADMIN_ROLE_VALUES.map((r) => `"${r}"`).join(",")})`)
        .in("account_status", ["restricted", "suspended"]),
      supabaseAdmin
        .from("tip_intents")
        .select("receipt_id", { count: "exact", head: true })
        .eq("refund_status", "initiated"),
      supabaseAdmin
        .from("tip_intents")
        .select("receipt_id", { count: "exact", head: true })
        .eq("status", "disputed"),
      supabaseAdmin
        .from("profiles")
        .select("owed_balance")
        .gt("owed_balance", 0),
    ]);

    const totalOwed = (owedRows.data ?? []).reduce(
      (sum: number, r: any) => sum + Number(r.owed_balance ?? 0),
      0
    );

    // Alerts data
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const staleCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const [recentDisputes, staleRefunds] = await Promise.all([
      supabaseAdmin
        .from("tip_intents")
        .select("receipt_id", { count: "exact", head: true })
        .eq("status", "disputed")
        .gte("created_at", oneHourAgo),
      supabaseAdmin
        .from("tip_intents")
        .select("receipt_id", { count: "exact", head: true })
        .eq("refund_status", "initiated")
        .lt("refund_initiated_at", staleCutoff),
    ]);

    return NextResponse.json({
      totalUsers: users.count ?? 0,
      restrictedUsers: restricted.count ?? 0,
      pendingRefunds: refunds.count ?? 0,
      activeDisputes: disputes.count ?? 0,
      totalOwed,
      owedCount: (owedRows.data ?? []).length,
      recentDisputeCount: recentDisputes.count ?? 0,
      staleRefundCount: staleRefunds.count ?? 0,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
