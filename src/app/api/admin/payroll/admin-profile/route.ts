import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

const FALLBACK_RATES: Record<string, number> = {
  support_admin: 0,
  finance_admin: 0,
  super_admin: 0,
  owner: 0,
};

/**
 * GET — Full pay profile for a single admin across all payroll runs.
 * Query: ?admin_id=<uuid>
 * Returns: current rate, summary stats, and per-run pay history.
 */
export async function GET(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try { requireRole(session.role, "payroll"); } catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

    const url = new URL(req.url);
    const adminId = url.searchParams.get("admin_id");
    if (!adminId) return NextResponse.json({ error: "Missing admin_id" }, { status: 400 });

    // Get admin profile
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("user_id, first_name, last_name, display_name, role")
      .eq("user_id", adminId)
      .maybeSingle();

    const name = profile
      ? (profile.first_name && profile.last_name
          ? `${profile.first_name} ${profile.last_name}`
          : profile.display_name || "Unnamed")
      : "Unknown";

    // Get current pay rate
    const { data: rateRows } = await supabaseAdmin
      .from("admin_pay_rates")
      .select("admin_id, role, hourly_rate");

    const rates = rateRows ?? [];
    const override = rates.find((r) => r.admin_id === adminId);
    const roleRate = rates.find((r) => r.role === profile?.role);
    const currentRate = override
      ? Number(override.hourly_rate)
      : roleRate
        ? Number(roleRate.hourly_rate)
        : FALLBACK_RATES[profile?.role ?? ""] ?? 0;
    const rateType = override ? "override" : "role default";

    // Get all payroll items for this admin, joined with run info
    const { data: items } = await supabaseAdmin
      .from("payroll_items")
      .select("id, payroll_run_id, hours, rate, total_pay, created_at")
      .eq("admin_id", adminId)
      .order("created_at", { ascending: false })
      .limit(100);

    // Get the run details for each item
    const runIds = [...new Set((items ?? []).map((i) => i.payroll_run_id))];
    const runs: Record<string, { start_date: string; end_date: string; status: string; paid_at: string | null }> = {};

    if (runIds.length > 0) {
      const { data: runRows } = await supabaseAdmin
        .from("payroll_runs")
        .select("id, start_date, end_date, status, paid_at")
        .in("id", runIds);

      for (const r of runRows ?? []) {
        runs[r.id] = { start_date: r.start_date, end_date: r.end_date, status: r.status, paid_at: r.paid_at };
      }
    }

    // Build enriched history
    const payHistory = (items ?? []).map((i) => ({
      ...i,
      run: runs[i.payroll_run_id] ?? null,
    }));

    // Summary stats
    const totalEarned = (items ?? []).reduce((s, i) => s + Number(i.total_pay), 0);
    const totalHours = (items ?? []).reduce((s, i) => s + Number(i.hours), 0);
    const paidRuns = payHistory.filter((p) => p.run?.status === "paid").length;
    const pendingRuns = payHistory.filter((p) => p.run?.status === "pending").length;

    // Current period hours (from admin_sessions this week)
    const now = new Date();
    const weekStart = new Date(now);
    const day = weekStart.getUTCDay();
    const diff = day === 0 ? 6 : day - 1;
    weekStart.setUTCDate(weekStart.getUTCDate() - diff);
    weekStart.setUTCHours(0, 0, 0, 0);

    const { data: sessions } = await supabaseAdmin
      .from("admin_sessions")
      .select("total_active_seconds")
      .eq("admin_id", adminId)
      .gte("started_at", weekStart.toISOString());

    const currentWeekSeconds = (sessions ?? []).reduce((s, r) => s + (r.total_active_seconds ?? 0), 0);
    const currentWeekHours = parseFloat((currentWeekSeconds / 3600).toFixed(2));
    const currentWeekPay = parseFloat((currentWeekHours * currentRate).toFixed(2));

    return NextResponse.json({
      admin: {
        id: adminId,
        name,
        role: profile?.role ?? "unknown",
        currentRate,
        rateType,
      },
      currentWeek: {
        hours: currentWeekHours,
        rate: currentRate,
        estimated_pay: currentWeekPay,
      },
      summary: {
        total_earned: parseFloat(totalEarned.toFixed(2)),
        total_hours: parseFloat(totalHours.toFixed(2)),
        total_runs: payHistory.length,
        paid_runs: paidRuns,
        pending_runs: pendingRuns,
      },
      payHistory,
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
