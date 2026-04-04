import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { calculateAdminRisk } from "@/lib/adminRiskEngine";

export const runtime = "nodejs";

// GET — get a single admin's full profile + activity
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;

    // Get admin row
    const { data: admin, error } = await supabaseAdmin
      .from("admins")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !admin) {
      return NextResponse.json({ error: "Admin not found" }, { status: 404 });
    }

    // Get profile info
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("admin_id, email, availability, last_active_at, display_name, avatar_url")
      .eq("user_id", admin.user_id)
      .maybeSingle();

    // Get recent actions (last 50)
    const { data: actions } = await supabaseAdmin
      .from("admin_actions")
      .select("id, action, target_user, reason, severity, metadata, created_at")
      .eq("admin_id", admin.user_id)
      .order("created_at", { ascending: false })
      .limit(50);

    // Get action counts for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count: actionsToday } = await supabaseAdmin
      .from("admin_actions")
      .select("id", { count: "exact", head: true })
      .eq("admin_id", admin.user_id)
      .gte("created_at", today.toISOString());

    // Count restrictions issued
    const { count: restrictionsIssued } = await supabaseAdmin
      .from("admin_actions")
      .select("id", { count: "exact", head: true })
      .eq("admin_id", admin.user_id)
      .in("action", ["restrict_user", "admin_restricted"]);

    // Count overrides
    const { count: overrides } = await supabaseAdmin
      .from("admin_actions")
      .select("id", { count: "exact", head: true })
      .eq("admin_id", admin.user_id)
      .ilike("action", "%override%");

    // Get tickets for this admin (with discipline fields)
    const { data: tickets } = await supabaseAdmin
      .from("admin_tickets")
      .select("id, type, message, status, created_at, acknowledged_at, resolved_at, auto_generated, from_role, to_role, from_admin:from_admin_id(id, full_name)")
      .eq("to_admin_id", id)
      .order("created_at", { ascending: false })
      .limit(20);

    // Total action count
    const { count: totalActions } = await supabaseAdmin
      .from("admin_actions")
      .select("id", { count: "exact", head: true })
      .eq("admin_id", admin.user_id);

    // ── Performance Metrics ──
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Actions last 7 days
    const { count: actionsWeek } = await supabaseAdmin
      .from("admin_actions")
      .select("id", { count: "exact", head: true })
      .eq("admin_id", admin.user_id)
      .gte("created_at", sevenDaysAgo);

    // Tickets handled (resolved by this admin)
    const { data: senderAdmin } = await supabaseAdmin
      .from("admins")
      .select("id")
      .eq("user_id", admin.user_id)
      .maybeSingle();

    let ticketsResolved = 0;
    if (senderAdmin) {
      const { count } = await supabaseAdmin
        .from("admin_tickets")
        .select("id", { count: "exact", head: true })
        .eq("from_admin_id", senderAdmin.id)
        .eq("status", "resolved");
      ticketsResolved = count ?? 0;
    }

    // Critical actions this week
    const { count: criticalWeek } = await supabaseAdmin
      .from("admin_actions")
      .select("id", { count: "exact", head: true })
      .eq("admin_id", admin.user_id)
      .eq("severity", "critical")
      .gte("created_at", sevenDaysAgo);

    // ── Risk Score ──
    const risk = admin.role !== "owner"
      ? await calculateAdminRisk(admin.user_id)
      : { score: 0, level: "low", factors: [] };

    // Last action
    const { data: lastAction } = await supabaseAdmin
      .from("admin_actions")
      .select("action, created_at, target_user")
      .eq("admin_id", admin.user_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Resolve last_login_at: fall back to Supabase Auth last_sign_in_at
    let lastLogin = admin.last_login_at;
    if (!lastLogin) {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(admin.user_id);
      lastLogin = authUser?.user?.last_sign_in_at ?? profile?.last_active_at ?? null;
    }

    return NextResponse.json({
      admin: {
        ...admin,
        last_login_at: lastLogin,
        admin_id_display: profile?.admin_id ?? null,
        email: profile?.email ?? null,
        availability: profile?.availability ?? "offline",
        last_active_at: profile?.last_active_at ?? null,
        display_name: profile?.display_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
      },
      stats: {
        total_actions: totalActions ?? 0,
        actions_today: actionsToday ?? 0,
        restrictions_issued: restrictionsIssued ?? 0,
        overrides: overrides ?? 0,
      },
      performance: {
        actions_week: actionsWeek ?? 0,
        avg_actions_day: Math.round((actionsWeek ?? 0) / 7),
        tickets_resolved: ticketsResolved,
        critical_week: criticalWeek ?? 0,
      },
      risk,
      last_action: lastAction ?? null,
      actions: actions ?? [],
      tickets: tickets ?? [],
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
