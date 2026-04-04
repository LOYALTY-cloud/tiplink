import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

function startOfDay() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfWeek() {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfLastWeek() {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day - 7);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfMonth() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function GET(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
    requireRole(session.role, "revenue");

    // Audit: log financial data access
    const accessTime = new Date().toISOString();
    console.log("Revenue access:", { userId: session.userId, role: session.role, time: accessTime });
    await supabaseAdmin.from("admin_access_logs").insert({
      user_id: session.userId,
      route: "/api/admin/revenue",
      role: session.role,
      accessed_at: accessTime,
    });

    // Pull from transactions_ledger — single source of truth
    const { data: txs, error } = await supabaseAdmin
      .from("transactions_ledger")
      .select("amount, created_at, meta");

    if (error || !txs) {
      return NextResponse.json({ error: "Failed to load data" }, { status: 500 });
    }

    let totalRevenue = 0;
    let totalVolume = 0;
    let totalStripeFees = 0;
    let totalRefunds = 0;
    let tipCount = 0;
    let refundCount = 0;

    let todayRevenue = 0;
    let yesterdayRevenue = 0;
    let weekRevenue = 0;
    let lastWeekRevenue = 0;
    let monthRevenue = 0;
    let sameDayLastWeekRevenue = 0;

    const today = startOfDay();

    // Same day last week (e.g. this Monday vs last Monday)
    const sameDayLW = new Date();
    sameDayLW.setDate(sameDayLW.getDate() - 7);
    sameDayLW.setHours(0, 0, 0, 0);
    const sameDayLWStart = sameDayLW.toISOString();
    const sameDayLWEnd = new Date(sameDayLW.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const yesterday = startOfYesterday();
    const week = startOfWeek();
    const lastWeek = startOfLastWeek();
    const month = startOfMonth();

    // Daily breakdown for chart (configurable range)
    const url = new URL(req.url);
    const range = url.searchParams.get("range") ?? "30";
    const rangeDays = ["7", "30", "90"].includes(range) ? Number(range) : 30;
    const rangeStart = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString();
    const dailyMap = new Map<string, { fees: number; stripeFees: number; volume: number; refunds: number; count: number }>();

    for (const tx of txs) {
      const amount = Number(tx.amount || 0);
      const meta = (tx.meta || {}) as Record<string, unknown>;
      const date = tx.created_at;

      const platformFee = Number(meta.platform_fee || 0);
      const stripeFee = Number(meta.stripe_fee || 0);

      totalRevenue += platformFee;
      totalStripeFees += stripeFee;

      if (amount > 0) {
        totalVolume += amount;
        tipCount++;
      }

      if (amount < 0) {
        totalRefunds += Math.abs(amount);
        refundCount++;
      }

      if (date >= today) {
        todayRevenue += platformFee;
      } else if (date >= yesterday) {
        yesterdayRevenue += platformFee;
      }

      if (date >= week) {
        weekRevenue += platformFee;
      } else if (date >= lastWeek) {
        lastWeekRevenue += platformFee;
      }

      if (date >= month) {
        monthRevenue += platformFee;
      }

      if (date >= sameDayLWStart && date < sameDayLWEnd) {
        sameDayLastWeekRevenue += platformFee;
      }

      // Daily chart data (within selected range)
      if (date >= rangeStart) {
        const dayKey = date.slice(0, 10);
        const existing = dailyMap.get(dayKey) ?? { fees: 0, stripeFees: 0, volume: 0, refunds: 0, count: 0 };
        existing.fees += platformFee;
        existing.stripeFees += stripeFee;
        if (amount > 0) {
          existing.volume += amount;
          existing.count++;
        }
        if (amount < 0) {
          existing.refunds += Math.abs(amount);
        }
        dailyMap.set(dayKey, existing);
      }
    }

    const daily = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({
        date,
        fees: Math.round(d.fees * 100) / 100,
        stripeFees: Math.round(d.stripeFees * 100) / 100,
        volume: Math.round(d.volume * 100) / 100,
        net: Math.round(d.fees * 100) / 100,
        count: d.count,
      }));

    // Revenue velocity: $/hr since midnight
    const todayStart = new Date(today);
    const hoursElapsed = Math.max((Date.now() - todayStart.getTime()) / 3_600_000, 0.1);
    const todayVelocity = Math.round((todayRevenue / hoursElapsed) * 100) / 100;

    // KPI aggregates
    const avgTipSize = tipCount > 0 ? Math.round((totalVolume / tipCount) * 100) / 100 : 0;
    const refundRate = tipCount > 0 ? Math.round((refundCount / tipCount) * 10000) / 100 : 0; // percent, 2 decimals

    // Anomaly detection (with severity: warning | critical)
    const anomalies: { type: string; severity: "warning" | "critical"; message: string }[] = [];
    if (yesterdayRevenue > 0 && todayRevenue > yesterdayRevenue * 2) {
      anomalies.push({ type: "spike", severity: "warning", message: `Today's revenue is ${(todayRevenue / yesterdayRevenue).toFixed(1)}x yesterday` });
    }
    if (refundRate > 10) {
      const sev = refundRate > 20 ? "critical" as const : "warning" as const;
      anomalies.push({ type: "refund", severity: sev, message: `Refund rate is ${refundRate}% — above 10% threshold` });
    }
    const todayRefunds = txs.filter(tx => tx.created_at >= today && Number(tx.amount || 0) < 0).length;
    if (todayRefunds >= 5) {
      const sev = todayRefunds >= 10 ? "critical" as const : "warning" as const;
      anomalies.push({ type: "refund", severity: sev, message: `${todayRefunds} refunds today — unusual volume` });
    }

    // Confidence indicator: Stable / Growing / Volatile
    // Trend % for confidence calc
    const trendMid = Math.floor(daily.length / 2);
    const trendFirstHalf = daily.slice(0, trendMid).reduce((s, d) => s + d.fees, 0);
    const trendSecondHalf = daily.slice(trendMid).reduce((s, d) => s + d.fees, 0);
    const trendPct = trendFirstHalf > 0
      ? ((trendSecondHalf - trendFirstHalf) / trendFirstHalf) * 100
      : trendSecondHalf > 0 ? 100 : 0;

    const revenueValues = daily.map(d => d.fees);
    let confidence: "Stable" | "Growing" | "Volatile" = "Stable";
    let confidenceReason = "Revenue is consistent with low variance";
    if (revenueValues.length >= 3) {
      const mean = revenueValues.reduce((s, v) => s + v, 0) / revenueValues.length;
      const variance = revenueValues.reduce((s, v) => s + (v - mean) ** 2, 0) / revenueValues.length;
      const cv = mean > 0 ? Math.sqrt(variance) / mean : 0; // coefficient of variation
      if (cv > 0.6) {
        confidence = "Volatile";
        confidenceReason = `High variance in daily revenue (CV: ${(cv * 100).toFixed(0)}%) — revenue fluctuated heavily over the period`;
      } else if (trendPct > 15) {
        confidence = "Growing";
        confidenceReason = `Revenue trending up ${trendPct.toFixed(0)}% — second half of period outperformed first half`;
      }
    }

    // Best performing range hint
    const now = Date.now();
    const calcGrowth = (days: number) => {
      const cutoff = new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
      const inRange = daily.filter(d => d.date >= cutoff.slice(0, 10));
      if (inRange.length < 2) return 0;
      const m = Math.floor(inRange.length / 2);
      const fh = inRange.slice(0, m).reduce((s, d) => s + d.fees, 0);
      const sh = inRange.slice(m).reduce((s, d) => s + d.fees, 0);
      return fh > 0 ? ((sh - fh) / fh) * 100 : sh > 0 ? 100 : 0;
    };
    const rangeGrowth = { "7": calcGrowth(7), "30": calcGrowth(30), "90": calcGrowth(90) };
    const bestRange = Object.entries(rangeGrowth).reduce((best, [k, v]) => v > best[1] ? [k, v] as [string, number] : best, ["30", -Infinity] as [string, number])[0];

    return NextResponse.json({
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalVolume: Math.round(totalVolume * 100) / 100,
      totalStripeFees: Math.round(totalStripeFees * 100) / 100,
      totalRefunds: Math.round(totalRefunds * 100) / 100,
      todayRevenue: Math.round(todayRevenue * 100) / 100,
      yesterdayRevenue: Math.round(yesterdayRevenue * 100) / 100,
      weekRevenue: Math.round(weekRevenue * 100) / 100,
      lastWeekRevenue: Math.round(lastWeekRevenue * 100) / 100,
      monthRevenue: Math.round(monthRevenue * 100) / 100,
      todayVelocity,
      tipCount,
      refundCount,
      avgTipSize,
      refundRate,
      sameDayLastWeekRevenue: Math.round(sameDayLastWeekRevenue * 100) / 100,
      anomalies,
      confidence,
      confidenceReason,
      bestRange,
      daily,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
