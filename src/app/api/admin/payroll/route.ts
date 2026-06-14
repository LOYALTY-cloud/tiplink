import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";
import { ADMIN_ROLES } from "@/lib/auth/permissions";

export const runtime = "nodejs";

// Fallback if DB has no rate for a role yet
const FALLBACK_RATES: Record<string, number> = {
  support_admin: 0,
  finance_admin: 0,
  super_admin: 0,
  owner: 0,
};

type PayRate = { admin_id: string | null; role: string | null; hourly_rate: number };

function getDateRange(range: string, now: Date): { start: Date; end: Date } {
  const day = now.getUTCDay(); // 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat

  if (range === "today") {
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    return { start, end: now };
  }

  if (range === "last_week") {
    const end = new Date(now);
    const diff = day === 0 ? 6 : day - 1;
    end.setUTCDate(end.getUTCDate() - diff);
    end.setUTCHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 7);
    return { start, end };
  }

  // Twice-weekly: Mon–Wed (1st half) and Thu–Sun (2nd half)
  // "week_first_half"  → Mon 00:00 → Wed 23:59:59 of this week
  // "week_second_half" → Thu 00:00 → Sun 23:59:59 of this week
  // "last_period"      → whichever half-week just completed

  if (range === "week_first_half") {
    const start = new Date(now);
    const toMon = day === 0 ? -6 : -(day - 1);
    start.setUTCDate(start.getUTCDate() + toMon);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 2); // Wednesday
    end.setUTCHours(23, 59, 59, 999);
    return { start, end: end > now ? now : end };
  }

  if (range === "week_second_half") {
    const start = new Date(now);
    const toMon = day === 0 ? -6 : -(day - 1);
    start.setUTCDate(start.getUTCDate() + toMon + 3); // Thursday
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 3); // Sunday
    end.setUTCHours(23, 59, 59, 999);
    return { start, end: end > now ? now : end };
  }

  if (range === "last_period") {
    // Mon(1)/Tue(2)/Wed(3) → last period was Thu–Sun of last week
    // Thu(4)/Fri(5)/Sat(6)/Sun(0) → last period was Mon–Wed of this week
    const inFirstHalf = day >= 1 && day <= 3;
    if (inFirstHalf) {
      // Thu–Sun of last week
      const thisMonday = new Date(now);
      const toMon = day - 1;
      thisMonday.setUTCDate(thisMonday.getUTCDate() - toMon);
      thisMonday.setUTCHours(0, 0, 0, 0);
      const start = new Date(thisMonday);
      start.setUTCDate(start.getUTCDate() - 4); // last Thu
      const end = new Date(thisMonday);
      end.setUTCHours(0, 0, 0, 0);              // last Sun = day before this Mon (midnight exclusive → use Mon midnight as end)
      return { start, end };
    } else {
      // Mon–Wed of this week
      const start = new Date(now);
      const toMon = day === 0 ? -6 : -(day - 1);
      start.setUTCDate(start.getUTCDate() + toMon);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 2); // Wednesday
      end.setUTCHours(23, 59, 59, 999);
      return { start, end };
    }
  }

  // default: this week (Mon–now)
  const start = new Date(now);
  const diff = day === 0 ? 6 : day - 1;
  start.setUTCDate(start.getUTCDate() - diff);
  start.setUTCHours(0, 0, 0, 0);
  return { start, end: now };
}

/**
 * GET — Returns payroll data: hours × rate for each admin in the selected period.
 */
export async function GET(req: Request) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try { requireRole(admin.role, "payroll"); } catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

    const now = new Date();
    const url = new URL(req.url);
    const range = url.searchParams.get("range") ?? "week";
    const { start, end } = getDateRange(range, now);

    const { data: sessions } = await supabaseAdmin
      .from("admin_sessions")
      .select("id, admin_id, total_active_seconds, started_at, ended_at, last_active_at")
      .or(`started_at.gte.${start.toISOString()},last_active_at.gte.${start.toISOString()}`)
      .lte("started_at", end.toISOString())
      .order("started_at", { ascending: true });

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id, first_name, last_name, display_name, role")
      .in("role", ADMIN_ROLES);

    // Fetch saved pay rates (admin overrides + role defaults)
    const { data: rateRows } = await supabaseAdmin
      .from("admin_pay_rates")
      .select("admin_id, role, hourly_rate");

    const rates = (rateRows ?? []) as PayRate[];

    function getRate(userId: string, role: string): number {
      // 1) per-admin override
      const override = rates.find((r) => r.admin_id === userId);
      if (override) return Number(override.hourly_rate);
      // 2) role default from DB
      const roleRate = rates.find((r) => r.role === role);
      if (roleRate) return Number(roleRate.hourly_rate);
      // 3) hardcoded fallback
      return FALLBACK_RATES[role] ?? 0;
    }

    if (!profiles) {
      return NextResponse.json({ admins: [], total: 0 });
    }

    // Aggregate seconds per admin + per day
    const totals = new Map<string, number>();
    const dailyTotals = new Map<string, Map<string, number>>(); // admin_id → date → seconds
    const sessionsByAdmin = new Map<string, Array<{ id: string; started_at: string; ended_at: string | null; active_seconds: number }>>(); // admin_id → sessions

    for (const s of sessions ?? []) {
      totals.set(s.admin_id, (totals.get(s.admin_id) ?? 0) + (s.total_active_seconds ?? 0));

      // Use last_active_at for day bucket — reflects which day the work actually happened
      const activeDay = s.last_active_at ?? s.started_at;
      const day = new Date(activeDay).toISOString().slice(0, 10); // YYYY-MM-DD UTC
      if (!dailyTotals.has(s.admin_id)) dailyTotals.set(s.admin_id, new Map());
      const dayMap = dailyTotals.get(s.admin_id)!;
      dayMap.set(day, (dayMap.get(day) ?? 0) + (s.total_active_seconds ?? 0));

      // Collect individual sessions for clock-in/clock-out display
      if (!sessionsByAdmin.has(s.admin_id)) sessionsByAdmin.set(s.admin_id, []);
      sessionsByAdmin.get(s.admin_id)!.push({
        id: s.id,
        started_at: s.started_at,
        ended_at: s.ended_at ?? null,
        active_seconds: s.total_active_seconds ?? 0,
      });
    }

    const admins = profiles.map((p) => {
      const secs = totals.get(p.user_id) ?? 0;
      const hours = secs / 3600;
      const rate = getRate(p.user_id, p.role);
      const name =
        p.first_name && p.last_name
          ? `${p.first_name} ${p.last_name}`
          : p.display_name || "Unnamed";

      const dayMap = dailyTotals.get(p.user_id);
      const daily_breakdown = dayMap
        ? Array.from(dayMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, secs]) => ({
              date,
              hours: parseFloat((secs / 3600).toFixed(2)),
              minutes: Math.round(secs / 60),
            }))
        : [];

      return {
        admin_id: p.user_id,
        name,
        role: p.role,
        hours: parseFloat(hours.toFixed(2)),
        rate,
        daily_breakdown,
        sessions: sessionsByAdmin.get(p.user_id) ?? [],
      };
    });

    // Sort by earnings desc
    admins.sort((a, b) => b.hours * b.rate - a.hours * a.rate);

    const total = admins.reduce((sum, a) => sum + a.hours * a.rate, 0);

    return NextResponse.json({ admins, total: parseFloat(total.toFixed(2)) });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
