"use client";

import { useEffect, useState } from "react";
import { supabaseAdmin as supabase } from "@/lib/supabase/adminBrowserClient";
import { getAdminHeaders, getAdminSession } from "@/lib/auth/adminSession";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/walletFees";
import { useToast } from "@/lib/useToast";
import { useConnectionState } from "@/lib/useConnectionState";
import { ToastStack } from "@/components/ToastStack";
import RevenueCards from "@/components/admin/RevenueCards";
import RevenueBreakdown from "@/components/admin/RevenueBreakdown";
import TopEarnersWidget from "@/components/admin/TopEarnersWidget";

type RangeLabel = "7D" | "30D" | "90D";
const RANGE_MAP: Record<RangeLabel, string> = { "7D": "7", "30D": "30", "90D": "90" };

type RevenueData = {
  totalRevenue: number;
  totalVolume: number;
  totalStripeFees: number;
  totalRefunds: number;
  todayRevenue: number;
  yesterdayRevenue: number;
  weekRevenue: number;
  lastWeekRevenue: number;
  monthRevenue: number;
  sameDayLastWeekRevenue: number;
  todayVelocity: number;
  tipCount: number;
  refundCount: number;
  avgTipSize: number;
  refundRate: number;
  anomalies: { type: string; severity: "warning" | "critical"; message: string }[];
  confidence: "Stable" | "Growing" | "Volatile";
  confidenceReason: string;
  bestRange: string;
  daily: { date: string; fees: number; stripeFees: number; volume: number; net: number; refunds: number; count: number }[];
};

export default function RevenuePage() {
  const router = useRouter();
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeLabel>("30D");
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [updatedAgo, setUpdatedAgo] = useState("just now");
  const toaster = useToast(3000);
  const { pulseClass, label: connectionLabel } = useConnectionState("revenue-probe");
  const [revenueGlow, setRevenueGlow] = useState(false);

  useEffect(() => {
    (async () => {
      const session = getAdminSession();
      if (!session) { router.replace("/admin/login"); return; }

      const allowed = ["owner", "super_admin"];
      if (!allowed.includes(session.role)) {
        router.replace("/dashboard");
        return;
      }
      await fetchRevenue(range);
    })();
   
  }, [router]);

  async function fetchRevenue(r: RangeLabel) {
    try {
      const headers = getAdminHeaders();
      if (!headers["X-Admin-Id"]) { router.replace("/admin/login"); return; }

      const res = await fetch(`/api/admin/revenue?range=${RANGE_MAP[r]}`, {
        headers,
      });

      if (res.status === 403) { router.replace("/dashboard"); return; }
      if (!res.ok) { setError("Failed to load revenue data"); setLoading(false); return; }

      const json = await res.json();
      setData(json);
      setLastUpdated(new Date());
      setUpdatedAgo("just now");
    } catch {
      setError("Failed to load revenue data");
    } finally {
      setLoading(false);
    }
  }

  // Tick the "Updated X ago" label
  useEffect(() => {
    if (!lastUpdated) return;
    const interval = setInterval(() => {
      const secs = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
      if (secs < 10) setUpdatedAgo("just now");
      else if (secs < 60) setUpdatedAgo(`${secs}s ago`);
      else setUpdatedAgo(`${Math.floor(secs / 60)}m ago`);
    }, 5000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  // Revenue updates handled by 15s polling below — realtime blocked by RLS on transactions_ledger

  const isLoaded = data !== null;
  useEffect(() => {
    if (!isLoaded) return;

    // Poll for revenue updates every 15 seconds (realtime blocked by RLS on transactions_ledger)
    const interval = setInterval(() => fetchRevenue(range), 15_000);
    return () => clearInterval(interval);
  }, [isLoaded, range]);

  function handleRangeChange(r: RangeLabel) {
    setRange(r);
    fetchRevenue(r);
  }

  if (loading) {
    return <p className="text-white/60 p-6">Loading…</p>;
  }

  if (error || !data) {
    return <p className="text-red-400 p-6">{error ?? "No data available"}</p>;
  }

  const isEmpty = data.totalRevenue === 0 && data.totalVolume === 0;

  if (isEmpty) {
    return (
      <div className="p-4 md:p-6 flex flex-col items-center justify-center min-h-[50vh] text-center">
        <p className="text-xl font-semibold text-white/70 mb-2">No Revenue Yet</p>
        <p className="text-sm text-white/40">Revenue data will appear here once tips start flowing.</p>
      </div>
    );
  }

  // Compute KPI momentum from daily data
  const avgTipMomentum = (() => {
    if (data.daily.length < 2) return null;
    const sorted = [...data.daily].sort((a, b) => a.date.localeCompare(b.date));
    const recent = sorted.slice(-7);
    const prior = sorted.slice(-14, -7);
    if (recent.length === 0 || prior.length === 0) return null;
    const recentAvg = recent.reduce((s, d) => s + (d.count > 0 ? d.volume / d.count : 0), 0) / recent.length;
    const priorAvg = prior.reduce((s, d) => s + (d.count > 0 ? d.volume / d.count : 0), 0) / prior.length;
    if (priorAvg === 0) return recentAvg > 0 ? { pct: 100, direction: "up" as const } : null;
    const pct = ((recentAvg - priorAvg) / priorAvg) * 100;
    return { pct: Math.abs(Math.round(pct * 10) / 10), direction: pct >= 0 ? "up" as const : "down" as const };
  })();

  return (
    <div className="p-4 md:p-6 pb-24">

      {/* ANOMALIES FIRST (PRIORITY) */}
      {data.anomalies.length > 0 && (
        <div className="space-y-2 mb-5">
          {data.anomalies.map((a, i) => (
            <div
              key={i}
              className={`px-4 py-3 rounded-xl text-sm border ${
                a.severity === "critical"
                  ? "bg-red-500/10 border-red-500/30 text-red-400"
                  : "bg-amber-500/10 border-amber-500/20 text-amber-400"
              }`}
            >
              {a.severity === "critical" ? "🔴" : "🟡"} {a.message}
            </div>
          ))}
        </div>
      )}

      {/* HERO STRIP */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-5">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-3 sm:p-4">
          <p className="text-[11px] sm:text-xs text-white/50 truncate">Today</p>
          <p className="text-base sm:text-xl font-semibold text-emerald-400 truncate">
            {formatMoney(data.todayRevenue)}
          </p>
        </div>

        <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-3 sm:p-4">
          <p className="text-[11px] sm:text-xs text-white/50 truncate">Velocity</p>
          <p className="text-base sm:text-xl font-semibold text-blue-400 truncate">
            {formatMoney(data.todayVelocity)}/hr
          </p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-3 sm:p-4">
          <p className="text-[11px] sm:text-xs text-white/50 truncate">Trend</p>
          <p
            className={`text-sm font-semibold ${
              data.confidence === "Growing"
                ? "text-emerald-400"
                : data.confidence === "Volatile"
                ? "text-amber-400"
                : "text-white"
            }`}
          >
            {data.confidence === "Growing"
              ? "↑ Growing"
              : data.confidence === "Volatile"
              ? "⚡ Volatile"
              : "• Stable"}
          </p>
        </div>
      </div>

      {/* LIVE STATUS + RANGE SELECTOR */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 text-xs text-white/50">
          <span className={`w-2 h-2 rounded-full ${pulseClass}`} />
          {connectionLabel} · {updatedAgo}
        </div>
        <div className="flex gap-1">
          {(["7D", "30D", "90D"] as RangeLabel[]).map((r) => (
            <button
              key={r}
              onClick={() => handleRangeChange(r)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                range === r
                  ? "bg-blue-500/20 text-blue-400 border border-blue-400/30"
                  : "bg-white/5 text-white/50 border border-white/10 hover:bg-white/10"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* TOAST STACK */}
      <ToastStack toasts={toaster.toasts} onDismiss={toaster.dismiss} />

      {/* MAIN REVENUE CARDS */}
      <RevenueCards data={data} glow={revenueGlow} />

      {/* SIGNAL */}
      <div className="flex items-center gap-2 mt-3 mb-4">
        <span className="text-xs text-white/40">Signal:</span>
        <span
          title={data.confidenceReason}
          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            data.confidence === "Growing"
              ? "bg-emerald-500/15 text-emerald-400"
              : data.confidence === "Volatile"
              ? "bg-amber-500/15 text-amber-400"
              : "bg-white/10 text-white/60"
          }`}
        >
          {data.confidence}
        </span>
      </div>

      {/* TOP EARNERS */}
      <div className="mb-6">
        <TopEarnersWidget />
      </div>

      {/* KPI MINI BAR */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
        <div className="bg-white/5 border border-white/10 rounded-xl p-2 sm:p-3 text-center">
          <p className="text-[11px] sm:text-xs text-white/40">Avg Tip</p>
          <p className="text-xs sm:text-sm font-semibold text-white truncate">
            {formatMoney(data.avgTipSize)}
          </p>
          {avgTipMomentum && (
            <p className={`text-[9px] sm:text-[10px] mt-0.5 leading-tight ${
              avgTipMomentum.direction === "up" ? "text-emerald-400" : "text-red-400"
            }`}>
              {avgTipMomentum.direction === "up" ? "↑" : "↓"} {avgTipMomentum.pct}%
            </p>
          )}
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-2 sm:p-3 text-center">
          <p className="text-[11px] sm:text-xs text-white/40">Total Tips</p>
          <p className="text-xs sm:text-sm font-semibold text-white">
            {data.tipCount.toLocaleString()}
          </p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-2 sm:p-3 text-center">
          <p className="text-[11px] sm:text-xs text-white/40">Refund %</p>
          <p
            className={`text-xs sm:text-sm font-semibold ${
              data.refundRate > 10 ? "text-red-400" : "text-white"
            }`}
          >
            {data.refundRate}%
          </p>
        </div>
      </div>

      {/* BREAKDOWN */}
      <RevenueBreakdown data={data} />

      {/* DAILY BREAKDOWN */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-white/80 mb-3">
          Daily Breakdown
        </h2>

        <div className="space-y-2">
          {data.daily.slice().reverse().map((d) => (
            <div
              key={d.date}
              onMouseEnter={() => setHoveredDate(d.date)}
              onMouseLeave={() => setHoveredDate(null)}
              className={`border border-white/10 rounded-xl p-3 transition ${
                hoveredDate === d.date ? "bg-white/10" : "bg-white/5"
              }`}
            >
              <div className="flex justify-between text-xs text-white/50">
                <span>{d.date}</span>
                <span>{formatMoney(d.volume)}</span>
              </div>

              <div className="flex justify-between mt-1 text-sm">
                <span className="text-white/50">Platform</span>
                <span className="text-emerald-400">
                  {formatMoney(d.fees)}
                </span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-white/50">Stripe</span>
                <span className="text-red-400">
                  -{formatMoney(d.stripeFees)}
                </span>
              </div>

              {d.refunds > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">Refunds</span>
                  <span className="text-yellow-400">
                    -{formatMoney(d.refunds)}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-sm border-t border-white/10 mt-2 pt-2">
                <span className="text-white/60 font-medium">Net</span>
                <span className="text-emerald-400 font-medium">
                  {formatMoney(d.net)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
