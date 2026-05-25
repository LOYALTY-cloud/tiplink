import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole, } from "@/lib/auth/requireRole";
import { ADMIN_ROLES } from "@/lib/auth/permissions";

export const runtime = "nodejs";

function getDateRange(range: string, now: Date): { start: Date; end: Date } {
  if (range === "today") {
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    return { start, end: now };
  }

  if (range === "last_week") {
    const end = new Date(now);
    const day = end.getUTCDay();
    const diff = day === 0 ? 6 : day - 1;
    end.setUTCDate(end.getUTCDate() - diff);
    end.setUTCHours(0, 0, 0, 0); // start of this week = end of last week

    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 7);
    return { start, end };
  }

  // default: this week (Mon–now)
  const start = new Date(now);
  const day = start.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  start.setUTCDate(start.getUTCDate() - diff);
  start.setUTCHours(0, 0, 0, 0);
  return { start, end: now };
}

/**
 * GET — Returns hours summary for all admins (today + this week).
 * Used by the Hours panel on /admin/staff.
 */
export async function GET(req: Request) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try { requireRole(admin.role, "staff"); } catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

    const now = new Date();
    const url = new URL(req.url);
    const range = url.searchParams.get("range") ?? "week";

    const { start, end } = getDateRange(range, now);

    // All sessions in the selected range
    const { data: sessions } = await supabaseAdmin
      .from("admin_sessions")
      .select("admin_id, started_at, total_active_seconds, ended_at")
      .gte("started_at", start.toISOString())
      .lte("started_at", end.toISOString());

    // Admin profiles for names/roles/presence
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id, first_name, last_name, display_name, role, availability, last_active_at")
      .in("role", ADMIN_ROLES);

    if (!profiles) {
      return NextResponse.json({ admins: [], total_today: 0, total_week: 0 });
    }

    const sessionList = sessions ?? [];

    // Build per-admin hours
    const adminHours = profiles.map((p) => {
      const mySessions = sessionList.filter((s) => s.admin_id === p.user_id);
      const totalSecs = mySessions.reduce((sum, s) => sum + (s.total_active_seconds ?? 0), 0);
      const hasOpenSession = mySessions.some((s) => !s.ended_at);

      const name = p.first_name && p.last_name
        ? `${p.first_name} ${p.last_name}`
        : p.display_name || "Unnamed";

      return {
        id: p.user_id,
        name,
        role: p.role,
        today_seconds: totalSecs,
        week_seconds: totalSecs,
        is_active: hasOpenSession,
        last_active_at: p.last_active_at,
      };
    });

    // Sort: active first, then by week hours desc
    adminHours.sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      return b.week_seconds - a.week_seconds;
    });

    const totalToday = adminHours.reduce((s, a) => s + a.today_seconds, 0);
    const totalWeek = adminHours.reduce((s, a) => s + a.week_seconds, 0);
    const activeCount = adminHours.filter((a) => a.is_active).length;

    return NextResponse.json({
      admins: adminHours,
      total_today: totalToday,
      total_week: totalWeek,
      active_count: activeCount,
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
