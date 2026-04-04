"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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
  daily: { date: string; fees: number; stripeFees: number; volume: number; net: number; count: number }[];
};

export default function RevenuePage() {
  const router = useRouter();
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [range, setRange] = useState<RangeLabel>("30D");
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [updatedAgo, setUpdatedAgo] = useState("just now");
  const toaster = useToast(3000);
  const { pulseClass, label: connectionLabel } = useConnectionState("revenue-probe");
  const [revenueGlow, setRevenueGlow] = useState(false);
  const refundTableRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const session = getAdminSession();
      if (!session) { router.replace("/admin/login"); return; }

      const allowed = ["owner", "super_admin"];
      if (!allowed.includes(session.role)) {
        router.replace("/dashboard");
        return;
      }
      setUserRole(session.role);
      await fetchRevenue(range);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function fetchRevenue(r: RangeLabel) {
    const headers = getAdminHeaders();
    if (!headers["X-Admin-Id"]) { router.replace("/admin/login"); return; }

    const res = await fetch(`/api/admin/revenue?range=${RANGE_MAP[r]}`, {
      headers,
    });

    if (res.status === 403) { router.replace("/dashboard"); return; }
    if (!res.ok) { setError("Failed to load revenue data"); setLoading(false); return; }

    const json = await res.json();
    setData(json);
    setLoading(false);
    setLastUpdated(new Date());
    setUpdatedAgo("just now");
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

  // Realtime subscription — patch state on new ledger entries
  const handleRealtimeTx = useCallback((payload: { new: Record<string, unknown> }) => {
    const tx = payload.new;
    if (!tx?.meta) return;

    const meta = tx.meta as Record<string, unknown>;
    const txType = String(meta.action ?? tx.type ?? "");

    // Only process relevant transaction types
    if (!["tip_received", "tip_refunded", "payout", "dispute"].includes(txType)) return;

    const platformFee = Number(meta.platform_fee || 0);
    const stripeFee = Number(meta.stripe_fee || 0);
    const amount = Number(tx.amount || 0);
    const todayKey = new Date().toISOString().slice(0, 10);

    setData((prev) => {
      if (!prev) return prev;

      const next = { ...prev };

      // Update totals
      next.totalRevenue = Math.round((next.totalRevenue + platformFee) * 100) / 100;
      next.totalStripeFees = Math.round((next.totalStripeFees + stripeFee) * 100) / 100;

      if (amount > 0) {
        next.totalVolume = Math.round((next.totalVolume + amount) * 100) / 100;
        next.tipCount += 1;
      }
      if (amount < 0) {
        next.totalRefunds = Math.round((next.totalRefunds + Math.abs(amount)) * 100) / 100;
        next.refundCount += 1;
      }

      // Update today's revenue
      next.todayRevenue = Math.round((next.todayRevenue + platformFee) * 100) / 100;
      next.weekRevenue = Math.round((next.weekRevenue + platformFee) * 100) / 100;
      next.monthRevenue = Math.round((next.monthRevenue + platformFee) * 100) / 100;

      // Recalculate KPIs
      next.avgTipSize = next.tipCount > 0 ? Math.round((next.totalVolume / next.tipCount) * 100) / 100 : 0;
      next.refundRate = next.tipCount > 0 ? Math.round((next.refundCount / next.tipCount) * 10000) / 100 : 0;

      // Recalculate velocity
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(0, 0, 0, 0);
      const hoursElapsed = Math.max((now.getTime() - midnight.getTime()) / 3_600_000, 0.1);
      next.todayVelocity = Math.round((next.todayRevenue / hoursElapsed) * 100) / 100;

      // Patch daily chart data
      const dailyCopy = next.daily.map(d => ({ ...d }));
      const existing = dailyCopy.find(d => d.date === todayKey);
      if (existing) {
        existing.fees = Math.round((existing.fees + platformFee) * 100) / 100;
        existing.stripeFees = Math.round((existing.stripeFees + stripeFee) * 100) / 100;
        existing.net = existing.fees;
        if (amount > 0) {
          existing.volume = Math.round((existing.volume + amount) * 100) / 100;
          existing.count += 1;
        }
      } else {
        dailyCopy.push({
          date: todayKey,
          fees: platformFee,
          stripeFees: stripeFee,
          volume: amount > 0 ? amount : 0,
          net: platformFee,
          count: amount > 0 ? 1 : 0,
        });
      }
      next.daily = dailyCopy;

      return next;
    });

    // Toast for new tips
    if (amount > 0 && platformFee > 0) {
      toaster.show(`New tip received — +${formatMoney(platformFee)} revenue`, "success");
      // Velocity glow pulse
      setRevenueGlow(true);
      setTimeout(() => setRevenueGlow(false), 600);
    } else if (amount < 0) {
      toaster.show(`Refund processed — -${formatMoney(Math.abs(amount))}`, "error");
    }

    setLastUpdated(new Date());
    setUpdatedAgo("just now");
  }, [toaster]);

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
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4">
          <p className="text-xs text-white/50">Today Revenue</p>
          <p className="text-xl font-semibold text-emerald-400">
            {formatMoney(data.todayRevenue)}
          </p>
        </div>

        <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4">
          <p className="text-xs text-white/50">Velocity</p>
          <p className="text-xl font-semibold text-blue-400">
            {formatMoney(data.todayVelocity)}/hr
          </p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <p className="text-xs text-white/50">Trend</p>
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

      {/* LIVE STATUS */}
      <div className="flex items-center gap-2 text-xs text-white/50 mb-4">
        <span className={`w-2 h-2 rounded-full ${pulseClass}`} />
        {connectionLabel} · {updatedAgo}
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
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
          <p className="text-xs text-white/40">Avg Tip</p>
          <p className="text-sm font-semibold text-white">
            {formatMoney(data.avgTipSize)}
          </p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
          <p className="text-xs text-white/40">Total Tips</p>
          <p className="text-sm font-semibold text-white">
            {data.tipCount.toLocaleString()}
          </p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
          <p className="text-xs text-white/40">Refund Rate</p>
          <p
            className={`text-sm font-semibold ${
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
              className={`bg-white/5 border border-white/10 rounded-xl p-3 ${
                hoveredDate === d.date ? "bg-white/10" : ""
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
