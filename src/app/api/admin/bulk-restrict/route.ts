import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromSession } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

/**
 * POST /api/admin/bulk-restrict
 * Emergency: restrict all users with owed_balance > 0 or active disputes.
 */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const session = await getAdminFromSession(jwt);
    if (!session) return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
    requireRole(session.role, "panic");
    const adminId = session.userId;

    // Cooldown: prevent double-trigger within 60 seconds
    const { data: lastAction } = await supabaseAdmin
      .from("admin_actions")
      .select("created_at")
      .eq("action", "bulk_restrict")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastAction && Date.now() - new Date(lastAction.created_at).getTime() < 60_000) {
      return NextResponse.json({ error: "Cooldown active — bulk restrict was triggered less than 60 seconds ago" }, { status: 429 });
    }

    // Find users with owed balance
    const { data: owedUsers } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .gt("owed_balance", 0)
      .neq("account_status", "restricted")
      .neq("account_status", "suspended")
      .neq("account_status", "closed")
      .neq("account_status", "closed_finalized");

    // Find users with active disputes
    const { data: disputedTips } = await supabaseAdmin
      .from("tip_intents")
      .select("creator_user_id")
      .eq("status", "disputed");

    const targetIds = new Set<string>();
    for (const u of owedUsers ?? []) targetIds.add(u.user_id);
    for (const t of disputedTips ?? []) targetIds.add(t.creator_user_id);

    if (targetIds.size === 0) {
      return NextResponse.json({ ok: true, restricted: 0, message: "No users to restrict" });
    }

    const ids = Array.from(targetIds);

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        account_status: "restricted",
        status_reason: `bulk_restrict_by_${adminId}`,
      })
      .in("user_id", ids)
      .not("account_status", "in", '("restricted","suspended","closed","closed_finalized")');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Log admin action
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: adminId,
      action: "bulk_restrict",
      target_user: null,
      metadata: { count: ids.length, user_ids: ids.slice(0, 20) },
      severity: "critical",
    });

    return NextResponse.json({ ok: true, restricted: ids.length });
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
