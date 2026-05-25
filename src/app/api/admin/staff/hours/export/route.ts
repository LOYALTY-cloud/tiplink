import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";
import { ADMIN_ROLES } from "@/lib/auth/permissions";

export const runtime = "nodejs";

const RANGE_LABELS: Record<string, string> = {
  today: "Today",
  week: "This Week",
  last_week: "Last Week",
};

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
    end.setUTCHours(0, 0, 0, 0);

    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 7);
    return { start, end };
  }

  // default: this week
  const start = new Date(now);
  const day = start.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  start.setUTCDate(start.getUTCDate() - diff);
  start.setUTCHours(0, 0, 0, 0);
  return { start, end: now };
}

/**
 * GET — Export admin hours as CSV for the selected payroll period.
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
    const label = RANGE_LABELS[range] ?? "This Week";

    const { data: sessions } = await supabaseAdmin
      .from("admin_sessions")
      .select("admin_id, total_active_seconds")
      .gte("started_at", start.toISOString())
      .lte("started_at", end.toISOString());

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id, first_name, last_name, display_name, role")
      .in("role", ADMIN_ROLES);

    if (!profiles) {
      return new Response(`Name,Role,Hours (${label})\n`, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename=admin-hours-${range}-${range}-${now.toISOString().slice(0, 10)}.csv`,
        },
      });
    }

    // Aggregate seconds per admin
    const totals = new Map<string, number>();
    for (const s of sessions ?? []) {
      totals.set(s.admin_id, (totals.get(s.admin_id) ?? 0) + (s.total_active_seconds ?? 0));
    }

    // Build CSV rows
    let csv = `Name,Role,Hours (${label})\n`;

    for (const p of profiles) {
      const name = p.first_name && p.last_name
        ? `${p.first_name} ${p.last_name}`
        : p.display_name || "Unnamed";
      const secs = totals.get(p.user_id) ?? 0;
      const hours = (secs / 3600).toFixed(2);
      // Escape name in case it contains commas
      const safeName = name.includes(",") ? `"${name}"` : name;
      csv += `${safeName},${p.role},${hours}\n`;
    }

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename=admin-hours-${now.toISOString().slice(0, 10)}.csv`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
