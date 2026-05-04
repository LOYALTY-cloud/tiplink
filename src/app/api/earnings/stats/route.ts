import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * GET /api/earnings/stats?range=30
 * Returns creator dashboard stats: earnings breakdown, daily chart data, tip feed, avg tip momentum.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!jwt) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } }
  );
  const { data: authRes, error: authErr } = await supabaseUser.auth.getUser();
  if (authErr || !authRes.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = authRes.user.id;

  const { searchParams } = new URL(req.url);
  const rangeDays = Math.min(Number(searchParams.get("range") ?? 30), 90);

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const rangeStart = new Date(now);
  rangeStart.setDate(now.getDate() - rangeDays);
  rangeStart.setHours(0, 0, 0, 0);

  // Fetch tips in range (for chart, recent tips, momentum)
  const { data: tips } = await supabaseAdmin
    .from("transactions_ledger")
    .select("amount, created_at, meta")
    .eq("user_id", userId)
    .eq("type", "tip_received")
    .gte("created_at", rangeStart.toISOString())
    .order("created_at", { ascending: false });

  const rows = tips ?? [];

  // Fetch all-time total separately (not limited to range)
  const { data: allTimeTips } = await supabaseAdmin
    .from("transactions_ledger")
    .select("amount")
    .eq("user_id", userId)
    .eq("type", "tip_received");

  const allTimeTotal = (allTimeTips ?? []).reduce((s, r) => s + Number(r.amount), 0);
  const allTimeCount = (allTimeTips ?? []).length;

  // Fetch theme sales (creator earnings) in range
  const { data: themeSalesInRange } = await supabaseAdmin
    .from("theme_sales")
    .select("creator_earnings, created_at, theme_id")
    .eq("seller_id", userId)
    .gte("created_at", rangeStart.toISOString())
    .order("created_at", { ascending: false });

  // Fetch all-time theme sales totals
  const { data: allTimeThemeSales } = await supabaseAdmin
    .from("theme_sales")
    .select("creator_earnings")
    .eq("seller_id", userId);

  const themeSalesRows = themeSalesInRange ?? [];
  const allTimeThemeEarnings = (allTimeThemeSales ?? []).reduce((s, r) => s + Number(r.creator_earnings), 0);
  const allTimeThemeCount = (allTimeThemeSales ?? []).length;

  // Compute period totals (from range data)
  let today = 0, week = 0, month = 0;
  for (const r of rows) {
    const amt = Number(r.amount);
    const ts = new Date(r.created_at);
    if (ts >= startOfDay) today += amt;
    if (ts >= startOfWeek) week += amt;
    if (ts >= startOfMonth) month += amt;
  }

  // Include theme sale earnings in period totals
  let themeSalesToday = 0, themeSalesWeek = 0, themeSalesMonth = 0;
  for (const r of themeSalesRows) {
    const amt = Number(r.creator_earnings);
    const ts = new Date(r.created_at);
    if (ts >= startOfDay) themeSalesToday += amt;
    if (ts >= startOfWeek) themeSalesWeek += amt;
    if (ts >= startOfMonth) themeSalesMonth += amt;
  }

  today += themeSalesToday;
  week += themeSalesWeek;
  month += themeSalesMonth;

  // Daily chart aggregation
  const dailyMap = new Map<string, { volume: number; count: number }>();
  for (const r of rows) {
    const day = r.created_at.slice(0, 10);
    const entry = dailyMap.get(day) ?? { volume: 0, count: 0 };
    entry.volume += Number(r.amount);
    entry.count += 1;
    dailyMap.set(day, entry);
  }

  // Fill in missing days
  const daily: { date: string; volume: number; count: number }[] = [];
  for (let d = new Date(rangeStart); d <= now; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    const entry = dailyMap.get(key);
    daily.push({ date: key, volume: entry?.volume ?? 0, count: entry?.count ?? 0 });
  }

  // Recent tip feed (last 20)
  const recentTips = rows.slice(0, 20).map((r) => {
    const meta = (r.meta ?? {}) as Record<string, unknown>;
    return {
      amount: Number(r.amount),
      created_at: r.created_at,
      tipper_name: meta.tipper_name ?? meta.sender_name ?? null,
      message: meta.message ?? null,
      anonymous: Boolean(meta.anonymous),
    };
  });

  // Avg tip + momentum
  const avgTip = allTimeCount > 0 ? allTimeTotal / allTimeCount : 0;
  const totalAllTime = allTimeTotal + allTimeThemeEarnings;

  // Momentum: compare last 7d avg to prior 7d
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(now.getDate() - 14);

  const recentRows = rows.filter((r) => new Date(r.created_at) >= sevenDaysAgo);
  const priorRows = rows.filter((r) => {
    const t = new Date(r.created_at);
    return t >= fourteenDaysAgo && t < sevenDaysAgo;
  });

  const recentAvg = recentRows.length > 0
    ? recentRows.reduce((s, r) => s + Number(r.amount), 0) / recentRows.length
    : 0;
  const priorAvg = priorRows.length > 0
    ? priorRows.reduce((s, r) => s + Number(r.amount), 0) / priorRows.length
    : 0;

  let momentum: { pct: number; direction: "up" | "down" } | null = null;
  if (priorAvg > 0) {
    const pct = ((recentAvg - priorAvg) / priorAvg) * 100;
    momentum = { pct: Math.abs(Math.round(pct * 10) / 10), direction: pct >= 0 ? "up" : "down" };
  } else if (recentAvg > 0) {
    momentum = { pct: 100, direction: "up" };
  }

  // Best day
  const bestDay = daily.reduce(
    (best, d) => (d.volume > best.volume ? d : best),
    { date: "", volume: 0, count: 0 }
  );

  // Recent theme sales feed (last 10)
  const recentThemeSales = themeSalesRows.slice(0, 10).map((r) => ({
    creator_earnings: Math.round(Number(r.creator_earnings) * 100) / 100,
    created_at: r.created_at,
    theme_id: r.theme_id,
  }));

  return NextResponse.json({
    today: Math.round(today * 100) / 100,
    week: Math.round(week * 100) / 100,
    month: Math.round(month * 100) / 100,
    total: Math.round(totalAllTime * 100) / 100,
    tipCount: allTimeCount,
    avgTip: Math.round(avgTip * 100) / 100,
    momentum,
    bestDay: bestDay.volume > 0 ? bestDay : null,
    daily,
    recentTips,
    themeSalesCount: allTimeThemeCount,
    themeSalesTotal: Math.round(allTimeThemeEarnings * 100) / 100,
    recentThemeSales,
  });
}
