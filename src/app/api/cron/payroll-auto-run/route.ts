import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ADMIN_ROLES } from "@/lib/auth/permissions";

export const runtime = "nodejs";

/**
 * GET /api/cron/payroll-auto-run
 *
 * Runs automatically every Sunday at midnight UTC (Mon 00:00) via Vercel cron.
 * The biweekly period ends Sunday 23:59:59 — this fires the moment it closes,
 * snapshots all active hours into a payroll run, and marks it paid.
 *
 * Schedule: 0 0 * * 1  (Monday 00:00 UTC = Sunday midnight)
 *
 * Protected by x-vercel-cron header (production) or CRON_SECRET query param
 * (manual testing).
 */

const FALLBACK_RATES: Record<string, number> = {
  support_admin: 0,
  finance_admin: 0,
  super_admin: 0,
  owner: 0,
};

type PayRate = { admin_id: string | null; role: string | null; hourly_rate: number };

// Biweekly anchor: Monday 2026-01-05 UTC
const BIWEEKLY_ANCHOR_MS = new Date("2026-01-05T00:00:00Z").getTime();
const BIWEEKLY_MS = 14 * 24 * 60 * 60 * 1000;

export async function GET(req: Request) {
  // Auth: Vercel cron header OR manual CRON_SECRET
  const isCron = req.headers.get("x-vercel-cron") === "1";
  const key = new URL(req.url).searchParams.get("key");
  if (!isCron && key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();

    // We fired at Mon 00:00 — the period that just ended is index - 1
    const currentIndex = Math.floor((now.getTime() - BIWEEKLY_ANCHOR_MS) / BIWEEKLY_MS);
    const periodIndex  = currentIndex - 1; // just-completed period
    const periodStart  = new Date(BIWEEKLY_ANCHOR_MS + periodIndex * BIWEEKLY_MS);
    const periodEnd    = new Date(BIWEEKLY_ANCHOR_MS + (periodIndex + 1) * BIWEEKLY_MS - 1);

    const startStr = periodStart.toISOString().slice(0, 10);
    const endStr   = periodEnd.toISOString().slice(0, 10);

    // Idempotency — skip if a run already exists for this period
    const { data: existing } = await supabaseAdmin
      .from("payroll_runs")
      .select("id, status")
      .eq("start_date", startStr)
      .eq("end_date", endStr)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: `Run already exists for ${startStr} → ${endStr} (${existing.status})`,
      });
    }

    // Fetch all sessions in this period
    const { data: sessions } = await supabaseAdmin
      .from("admin_sessions")
      .select("admin_id, total_active_seconds")
      .gte("started_at", periodStart.toISOString())
      .lte("started_at", periodEnd.toISOString());

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
      const secs  = totals.get(p.user_id) ?? 0;
      const hours = parseFloat((secs / 3600).toFixed(2));
      const rate  = getRate(p.user_id, p.role);
      const total_pay = parseFloat((hours * rate).toFixed(2));
      const name =
        p.first_name && p.last_name
          ? `${p.first_name} ${p.last_name}`
          : p.display_name || "Unnamed";
      return { admin_id: p.user_id, name, role: p.role, hours, rate, total_pay };
    });

    const total_amount = parseFloat(items.reduce((s, i) => s + i.total_pay, 0).toFixed(2));

    // Create the payroll run — status defaults to "pending" in DB
    const { data: run, error: runErr } = await supabaseAdmin
      .from("payroll_runs")
      .insert({ start_date: startStr, end_date: endStr, total_amount })
      .select()
      .single();

    if (runErr || !run) {
      console.error("payroll-auto-run: failed to create run", runErr?.message);
      return NextResponse.json({ error: "Failed to create payroll run" }, { status: 500 });
    }

    // Insert line items
    if (items.length > 0) {
      const { error: itemsErr } = await supabaseAdmin
        .from("payroll_items")
        .insert(items.map((i) => ({ ...i, payroll_run_id: run.id })));
      if (itemsErr) {
        console.error("payroll-auto-run: failed to insert items", itemsErr.message);
      }
    }

    // Auto-mark as paid immediately (checks go out Sunday midnight)
    const { error: paidErr } = await supabaseAdmin
      .from("payroll_runs")
      .update({ status: "paid", paid_at: now.toISOString() })
      .eq("id", run.id);

    if (paidErr) {
      console.error("payroll-auto-run: failed to mark paid", paidErr.message);
    }

    console.log(`payroll-auto-run: created run ${run.id} for ${startStr} → ${endStr}, total $${total_amount}, ${items.length} admins`);

    return NextResponse.json({
      ok: true,
      run_id: run.id,
      period: `${startStr} → ${endStr}`,
      total_amount,
      admin_count: items.length,
      paid_at: now.toISOString(),
    });
  } catch (err) {
    console.error("payroll-auto-run: uncaught error", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
