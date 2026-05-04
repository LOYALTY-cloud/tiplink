import { NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type ActivityRow = {
  id: string;
  type: string | null;
  title: string | null;
  description: string | null;
  related_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  action: string | null;
  label: string | null;
  severity: string | null;
};

function isAllowedRole(role: string): boolean {
  return role === "owner" || role === "super_admin";
}

function isValidDateParam(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function startEndOfUtcDay(date: string): { startIso: string; endIso: string } {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function fallbackTitle(row: ActivityRow): string {
  if (row.title) return row.title;
  if (row.label) return row.label;
  if (row.action) return row.action.replace(/_/g, " ");
  return "System activity";
}

function fallbackDescription(row: ActivityRow): string {
  if (row.description) return row.description;
  if (row.label && row.title) return row.label;
  return "";
}

function mapType(row: ActivityRow): string {
  if (row.type) return row.type;
  const action = (row.action ?? "").toLowerCase();
  if (action.includes("withdraw") || action.includes("payout") || action.includes("payment")) return "payment";
  if (action.includes("disciplin")) return "disciplinary";
  if (action.includes("ticket") || action.includes("support")) return "support";
  if (action.includes("fraud") || action.includes("risk")) return "fraud";
  return "system";
}

export async function GET(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session || !isAllowedRole(session.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

    if (!isValidDateParam(date)) {
      return NextResponse.json({ error: "Invalid date. Use YYYY-MM-DD." }, { status: 400 });
    }

    const { startIso, endIso } = startEndOfUtcDay(date);

    const { data, error } = await supabaseAdmin
      .from("admin_activity_log")
      .select("id, type, title, description, related_id, metadata, created_at, action, label, severity")
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .not("action", "in", '("ai_tool_executed","owner_ai_query")')
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      return NextResponse.json({ error: "Failed to load activity." }, { status: 500 });
    }

    const events = ((data ?? []) as ActivityRow[]).map((row) => ({
      id: row.id,
      type: mapType(row),
      title: fallbackTitle(row),
      description: fallbackDescription(row),
      related_id: row.related_id,
      metadata: row.metadata ?? {},
      severity: row.severity ?? "info",
      created_at: row.created_at,
    }));

    return NextResponse.json({ date, events });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
