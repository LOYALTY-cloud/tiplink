import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { ADMIN_ROLES } from "@/lib/auth/permissions";

export const runtime = "nodejs";

// Biweekly anchor matches payroll system
const BIWEEKLY_ANCHOR_MS = new Date("2026-01-05T00:00:00Z").getTime();
const BIWEEKLY_MS = 14 * 24 * 60 * 60 * 1000;

function getCurrentPeriodBounds(now: Date) {
  const idx = Math.floor((now.getTime() - BIWEEKLY_ANCHOR_MS) / BIWEEKLY_MS);
  return {
    start: new Date(BIWEEKLY_ANCHOR_MS + idx * BIWEEKLY_MS),
    end:   new Date(BIWEEKLY_ANCHOR_MS + (idx + 1) * BIWEEKLY_MS - 1),
  };
}

function getTodayBounds(now: Date) {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  return { start, end: now };
}

function isOnline(lastActiveAt: string | null): boolean {
  if (!lastActiveAt) return false;
  return Date.now() - new Date(lastActiveAt).getTime() < 60_000;
}

/**
 * GET /api/admin/workforce
 *
 * Returns:
 *  - `self`    — the requesting admin's own stats (all roles)
 *  - `company` — company-wide stats (owner / co_owner / super_admin only)
 */
export async function GET(req: Request) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const now = new Date();
    const { start: periodStart, end: periodEnd } = getCurrentPeriodBounds(now);
    const { start: todayStart } = getTodayBounds(now);

    // ── Self stats ───────────────────────────────────────────────────────────
    const { data: selfSessions } = await supabaseAdmin
      .from("admin_sessions")
      .select("id, started_at, ended_at, last_active_at, total_active_seconds")
      .eq("admin_id", admin.userId)
      .gte("started_at", periodStart.toISOString())
      .order("started_at", { ascending: true });

    const periodSecs = (selfSessions ?? []).reduce((s, r) => s + (r.total_active_seconds ?? 0), 0);
    const todaySecs  = (selfSessions ?? [])
      .filter(r => new Date(r.started_at) >= todayStart)
      .reduce((s, r) => s + (r.total_active_seconds ?? 0), 0);

    // This week (Mon–now)
    const weekStart = new Date(now);
    const dow = weekStart.getUTCDay();
    weekStart.setUTCDate(weekStart.getUTCDate() - (dow === 0 ? 6 : dow - 1));
    weekStart.setUTCHours(0, 0, 0, 0);
    const weekSecs = (selfSessions ?? [])
      .filter(r => new Date(r.started_at) >= weekStart)
      .reduce((s, r) => s + (r.total_active_seconds ?? 0), 0);

    // Active open session
    const openSession = (selfSessions ?? []).find(s => !s.ended_at) ?? null;

    const self = {
      today_seconds:      todaySecs,
      week_seconds:       weekSecs,
      period_seconds:     periodSecs,
      period_start:       periodStart.toISOString(),
      period_end:         periodEnd.toISOString(),
      clocked_in:         !!openSession,
      session_started_at: openSession?.started_at ?? null,
      today_sessions:     (selfSessions ?? [])
        .filter(r => new Date(r.started_at) >= todayStart)
        .map(r => ({
          id:             r.id,
          started_at:     r.started_at,
          ended_at:       r.ended_at ?? null,
          active_seconds: r.total_active_seconds ?? 0,
        })),
    };

    // ── Company stats (owner / co_owner / super_admin only) ─────────────────
    const ownerRoles = ["owner", "co_owner", "super_admin"];
    if (!ownerRoles.includes(admin.role)) {
      return NextResponse.json({ self, company: null });
    }

    // All admin profiles with presence
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id, first_name, last_name, display_name, role, last_active_at, availability")
      .in("role", ADMIN_ROLES);

    // Pay rates
    const { data: rateRows } = await supabaseAdmin
      .from("admin_pay_rates")
      .select("admin_id, role, hourly_rate");

    function getRate(userId: string, role: string): number {
      const override = (rateRows ?? []).find(r => r.admin_id === userId);
      if (override) return Number(override.hourly_rate);
      const roleRate = (rateRows ?? []).find(r => r.role === role);
      if (roleRate) return Number(roleRate.hourly_rate);
      return 0;
    }

    // All sessions for all admins in current period
    const { data: allSessions } = await supabaseAdmin
      .from("admin_sessions")
      .select("admin_id, started_at, ended_at, total_active_seconds")
      .gte("started_at", periodStart.toISOString())
      .order("started_at", { ascending: true });

    // Build per-admin aggregates
    const periodTotals = new Map<string, number>();
    const todayTotals  = new Map<string, number>();
    const weekTotals   = new Map<string, number>();

    for (const s of allSessions ?? []) {
      const secs = s.total_active_seconds ?? 0;
      const st   = new Date(s.started_at);

      periodTotals.set(s.admin_id, (periodTotals.get(s.admin_id) ?? 0) + secs);
      if (st >= todayStart)  todayTotals.set(s.admin_id, (todayTotals.get(s.admin_id) ?? 0) + secs);
      if (st >= weekStart)   weekTotals.set(s.admin_id, (weekTotals.get(s.admin_id) ?? 0) + secs);
    }

    const workforce = (profiles ?? []).map(p => {
      const name = p.first_name && p.last_name
        ? `${p.first_name} ${p.last_name}`
        : p.display_name || "Unnamed";
      const periodSecs = periodTotals.get(p.user_id) ?? 0;
      const todaySecs  = todayTotals.get(p.user_id) ?? 0;
      const weekSecs   = weekTotals.get(p.user_id) ?? 0;
      const rate       = getRate(p.user_id, p.role);
      const online     = isOnline(p.last_active_at ?? null);

      return {
        user_id:        p.user_id,
        name,
        role:           p.role,
        online,
        last_active_at: p.last_active_at ?? null,
        today_seconds:  todaySecs,
        week_seconds:   weekSecs,
        period_seconds: periodSecs,
        period_hours:   parseFloat((periodSecs / 3600).toFixed(2)),
        today_hours:    parseFloat((todaySecs / 3600).toFixed(2)),
        week_hours:     parseFloat((weekSecs / 3600).toFixed(2)),
        rate,
        period_pay:     parseFloat(((periodSecs / 3600) * rate).toFixed(2)),
      };
    });

    // Sort: online first, then by period hours desc
    workforce.sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      return b.period_hours - a.period_hours;
    });

    const totalPeriodSecs = workforce.reduce((s, w) => s + w.period_seconds, 0);
    const totalTodaySecs  = workforce.reduce((s, w) => s + w.today_seconds, 0);
    const payrollEstimate = workforce.reduce((s, w) => s + w.period_pay, 0);
    const onlineCount     = workforce.filter(w => w.online).length;

    const company = {
      online_count:      onlineCount,
      today_seconds:     totalTodaySecs,
      period_seconds:    totalPeriodSecs,
      payroll_estimate:  parseFloat(payrollEstimate.toFixed(2)),
      period_start:      periodStart.toISOString(),
      period_end:        periodEnd.toISOString(),
      workforce,
    };

    return NextResponse.json({ self, company });
  } catch (err) {
    console.error("workforce API error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
