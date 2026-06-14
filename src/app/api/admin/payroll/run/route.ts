import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { ADMIN_ROLES } from "@/lib/auth/permissions";

export const runtime = "nodejs";

const FALLBACK_RATES: Record<string, number> = {
  support_admin: 0,
  finance_admin: 0,
  super_admin: 0,
  owner: 0,
};

type PayRate = { admin_id: string | null; role: string | null; hourly_rate: number };

// Biweekly anchor: Monday 2026-01-05 UTC — every pay period is exactly 14 days
const BIWEEKLY_ANCHOR_MS = new Date("2026-01-05T00:00:00Z").getTime();
const BIWEEKLY_MS = 14 * 24 * 60 * 60 * 1000;

function getBiweeklyBounds(periodOffset: number, now: Date): { start: Date; end: Date } {
  const currentIndex = Math.floor((now.getTime() - BIWEEKLY_ANCHOR_MS) / BIWEEKLY_MS);
  const targetIndex = currentIndex + periodOffset;
  const start = new Date(BIWEEKLY_ANCHOR_MS + targetIndex * BIWEEKLY_MS);
  const end   = new Date(BIWEEKLY_ANCHOR_MS + (targetIndex + 1) * BIWEEKLY_MS - 1);
  return { start, end: end > now ? now : end };
}

function getDateRange(range: string, now: Date): { start: Date; end: Date } {
  if (range === "today") {
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    return { start, end: now };
  }
  if (range === "last_period") {
    return getBiweeklyBounds(-1, now); // previous completed 14-day period
  }
  // default / "current_period": current 14-day biweekly period up to now
  return getBiweeklyBounds(0, now);
}

/**
 * POST — Create a payroll run: snapshot hours × rate for each admin in the period.
 * Body: { range?: "today" | "week" | "last_week" }
 */
export async function POST(req: Request) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (admin.role !== "owner") return NextResponse.json({ error: "Owner only" }, { status: 403 });

    const body = await req.json();
    const range = body.range ?? "week";
    const now = new Date();
    const { start, end } = getDateRange(range, now);

    // Fetch sessions in range
    const { data: sessions } = await supabaseAdmin
      .from("admin_sessions")
      .select("admin_id, total_active_seconds")
      .gte("started_at", start.toISOString())
      .lte("started_at", end.toISOString());

    // Fetch admin profiles
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id, first_name, last_name, display_name, role")
      .in("role", ADMIN_ROLES);

    // Fetch pay rates
    const { data: rateRows } = await supabaseAdmin
      .from("admin_pay_rates")
      .select("admin_id, role, hourly_rate");

    const rates = (rateRows ?? []) as PayRate[];

    function getRate(userId: string, role: string): number {
      const override = rates.find((r) => r.admin_id === userId);
      if (override) return Number(override.hourly_rate);
      const roleRate = rates.find((r) => r.role === role);
      if (roleRate) return Number(roleRate.hourly_rate);
      return FALLBACK_RATES[role] ?? 0;
    }

    // Aggregate seconds per admin
    const totals = new Map<string, number>();
    for (const s of sessions ?? []) {
      totals.set(s.admin_id, (totals.get(s.admin_id) ?? 0) + (s.total_active_seconds ?? 0));
    }

    const items = (profiles ?? []).map((p) => {
      const secs = totals.get(p.user_id) ?? 0;
      const hours = parseFloat((secs / 3600).toFixed(2));
      const rate = getRate(p.user_id, p.role);
      const total_pay = parseFloat((hours * rate).toFixed(2));
      const name =
        p.first_name && p.last_name
          ? `${p.first_name} ${p.last_name}`
          : p.display_name || "Unnamed";
      return { admin_id: p.user_id, name, role: p.role, hours, rate, total_pay };
    });

    const total_amount = parseFloat(items.reduce((s, i) => s + i.total_pay, 0).toFixed(2));

    // Check for existing run with same date range
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);

    const { data: existing } = await supabaseAdmin
      .from("payroll_runs")
      .select("id, status")
      .eq("start_date", startStr)
      .eq("end_date", endStr)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: `A payroll run already exists for ${startStr} → ${endStr} (${existing.status})` },
        { status: 409 }
      );
    }

    // Create the payroll run
    const { data: run, error: runErr } = await supabaseAdmin
      .from("payroll_runs")
      .insert({
        start_date: startStr,
        end_date: endStr,
        total_amount,
      })
      .select()
      .single();

    if (runErr || !run) {
      return NextResponse.json({ error: "Failed to create payroll run." }, { status: 500 });
    }

    // Insert item snapshots and return with generated IDs
    let savedItems = items;
    if (items.length > 0) {
      const { data: inserted } = await supabaseAdmin
        .from("payroll_items")
        .insert(items.map((i) => ({ ...i, payroll_run_id: run.id })))
        .select();
      if (inserted) savedItems = inserted;
    }

    return NextResponse.json({ run, items: savedItems });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * GET — Fetch a payroll run + items by id, or list all runs.
 * Query: ?id=<uuid>  — single run with items
 *        (no id)     — list all runs
 */
export async function GET(req: Request) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (id) {
      const { data: run } = await supabaseAdmin
        .from("payroll_runs")
        .select("*")
        .eq("id", id)
        .single();

      const { data: items } = await supabaseAdmin
        .from("payroll_items")
        .select("*")
        .eq("payroll_run_id", id)
        .order("total_pay", { ascending: false });

      return NextResponse.json({ run, items });
    }

    // List all runs
    const { data: runs } = await supabaseAdmin
      .from("payroll_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    return NextResponse.json({ runs });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
