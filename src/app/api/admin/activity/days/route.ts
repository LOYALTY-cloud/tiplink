import { NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function isAllowedRole(role: string): boolean {
  return role === "owner" || role === "super_admin";
}

function isValidMonthParam(month: string): boolean {
  return /^\d{4}-\d{2}$/.test(month);
}

function monthRangeUtc(month: string): { startIso: string; endIso: string } {
  const [y, m] = month.split("-").map((v) => Number(v));
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

type DayRow = {
  created_at: string;
  type: string | null;
};

export async function GET(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session || !isAllowedRole(session.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const month = url.searchParams.get("month") ?? new Date().toISOString().slice(0, 7);

    if (!isValidMonthParam(month)) {
      return NextResponse.json({ error: "Invalid month. Use YYYY-MM." }, { status: 400 });
    }

    const { startIso, endIso } = monthRangeUtc(month);

    const { data, error } = await supabaseAdmin
      .from("admin_activity_log")
      .select("created_at, type")
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .not("action", "in", '("ai_tool_executed","owner_ai_query")')
      .limit(5000);

    if (error) {
      return NextResponse.json({ error: "Failed to load activity days." }, { status: 500 });
    }
    const counts: Record<string, { total: number; types: Record<string, number> }> = {};
    for (const row of (data ?? []) as DayRow[]) {
      const day = row.created_at.slice(0, 10);
      const eventType = row.type ?? "system";

      if (!counts[day]) {
        counts[day] = { total: 0, types: {} };
      }

      counts[day].total += 1;
      counts[day].types[eventType] = (counts[day].types[eventType] ?? 0) + 1;
    }

    return NextResponse.json({ month, counts });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
