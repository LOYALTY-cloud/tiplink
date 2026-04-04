"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useToast } from "@/lib/useToast";
import { useConnectionState } from "@/lib/useConnectionState";
import { ToastStack } from "@/components/ToastStack";
import { formatMoney } from "@/lib/walletFees";
import { ui } from "@/lib/ui";
import GoalSetup from "@/components/GoalSetup";
import GoalActive from "@/components/GoalActive";

type GoalData = {
  amount: number;
  period: "day" | "week" | "month";
  duration: number;
  startDate: string;
};

type DailyPoint = { date: string; volume: number; count: number };
type TipItem = {
  amount: number;
  created_at: string;
  tipper_name: string | null;
  message: string | null;
  anonymous: boolean;
};
type StatsData = {
  today: number;
  week: number;
  month: number;
  total: number;
  tipCount: number;
  avgTip: number;
  momentum: { pct: number; direction: "up" | "down" } | null;
  bestDay: { date: string; volume: number; count: number } | null;
  daily: DailyPoint[];
  recentTips: TipItem[];
};

type SummaryPeriod = {
  gross: number;
  fees: number;
  net: number;
  count: number;
  label: string;
};
type SummaryData = { month: SummaryPeriod; ytd: SummaryPeriod };

export default function CreatorEarningsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [updatedAgo, setUpdatedAgo] = useState("just now");
  const [earningsGlow, setEarningsGlow] = useState(false);
  const [goal, setGoal] = useState<GoalData | null>(null);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [exporting, setExporting] = useState(false);
  const toaster = useToast(3000);
  const { pulseClass, label: connectionLabel } = useConnectionState("creator-probe");

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { router.replace("/login"); return; }
      setUserId(u.user.id);
      await Promise.all([fetchStats(u.user.id), loadGoal(), fetchSummary(u.user.id)]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function loadGoal() {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token) return;
    const res = await fetch("/api/goals/get", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const json = await res.json();
    if (json.goal) setGoal(json.goal);
  }

  async function fetchStats(uid: string) {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token) { setLoading(false); return; }
    const res = await fetch(`/api/earnings/stats?range=30`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { setLoading(false); return; }
    const json = await res.json();
    setData(json);
    setLoading(false);
    setLastUpdated(new Date());
    setUpdatedAgo("just now");
  }

  async function fetchSummary(uid: string) {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token) return;
    const res = await fetch(`/api/earnings/summary`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setSummary(await res.json());
  }

  async function downloadCSV(range: string) {
    setExporting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) return;
      const res = await fetch(`/api/earnings/export?range=${range}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `1nelink-earnings-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  // Tick "Updated X ago"
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

  // Realtime: patch data on new tips
  const handleRealtimeTx = useCallback(
    (payload: { new: Record<string, unknown> }) => {
      const tx = payload.new;
      const amount = Number(tx.amount ?? 0);
      if (amount <= 0) return;

      const meta = (tx.meta ?? {}) as Record<string, unknown>;
      const todayKey = new Date().toISOString().slice(0, 10);

      setData((prev) => {
        if (!prev) return prev;
        const next = { ...prev };
        next.today = Math.round((next.today + amount) * 100) / 100;
        next.week = Math.round((next.week + amount) * 100) / 100;
        next.month = Math.round((next.month + amount) * 100) / 100;
        next.total = Math.round((next.total + amount) * 100) / 100;
        next.tipCount += 1;
        next.avgTip = Math.round((next.total / next.tipCount) * 100) / 100;

        // Patch daily chart
        const dailyCopy = next.daily.map((d) => ({ ...d }));
        const existing = dailyCopy.find((d) => d.date === todayKey);
        if (existing) {
          existing.volume = Math.round((existing.volume + amount) * 100) / 100;
          existing.count += 1;
        } else {
          dailyCopy.push({ date: todayKey, volume: amount, count: 1 });
        }
        next.daily = dailyCopy;

        // Prepend to tip feed
        next.recentTips = [
          {
            amount,
            created_at: new Date().toISOString(),
            tipper_name: (meta.tipper_name as string) ?? null,
            message: (meta.message as string) ?? null,
            anonymous: Boolean(meta.anonymous),
          },
          ...next.recentTips,
        ].slice(0, 20);

        return next;
      });

      // Glow + toast
      setEarningsGlow(true);
      setTimeout(() => setEarningsGlow(false), 600);
      const name = meta.anonymous
        ? "Someone"
        : (meta.tipper_name as string) || "Someone";
      toaster.show(`${name} tipped you ${formatMoney(amount)}!`, "success");

      setLastUpdated(new Date());
      setUpdatedAgo("just now");
    },
    [toaster]
  );

  const isLoaded = data !== null && userId !== null;
  useEffect(() => {
    if (!isLoaded || !userId) return;

    const channel = supabase
      .channel(`creator-tips-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "transactions_ledger",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const tx = payload.new as Record<string, unknown>;
          if (tx.type === "tip_received") handleRealtimeTx(payload as any);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isLoaded, userId, handleRealtimeTx]);

  const timeAgo = (iso: string) => {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };

  // Goal system (must be above early returns to preserve hook order)
  const goalAmount = goal?.amount ?? 0;
  const goalEarnings = useMemo(() => {
    if (!goal || !data) return 0;
    return data.daily
      .filter((d) => new Date(d.date) >= new Date(goal.startDate))
      .reduce((sum, d) => sum + d.volume, 0);
  }, [goal, data]);
  const progress = goalAmount > 0 ? Math.min((goalEarnings / goalAmount) * 100, 100) : 0;
  const remaining = Math.max(goalAmount - goalEarnings, 0);

  if (loading) return <p className="text-white/60 p-6">Loading…</p>;
  if (!data) return <p className="text-white/40 p-6">No earnings data yet.</p>;

  const isEmpty = data.total === 0;

  return (
    <div className="space-y-5 pb-24">
      {/* Toast Stack */}
      <ToastStack toasts={toaster.toasts} onDismiss={toaster.dismiss} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className={ui.h2}>Earnings</h1>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-white/30 flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${pulseClass}`} />
              {connectionLabel} · {updatedAgo}
            </span>
          )}
        </div>
      </div>

      {isEmpty ? (
        <div className={`${ui.card} p-8 text-center`}>
          <p className="text-3xl mb-2">💸</p>
          <p className="text-white/60 text-sm">No tips yet — share your link to start earning!</p>
        </div>
      ) : (
        <>
          {/* Earnings KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
            <div className={`bg-white/5 border border-white/10 rounded-xl md:rounded-2xl p-3 md:p-4 transition-all duration-300 ${earningsGlow ? "revenue-glow" : ""}`}>
              <p className="text-[10px] md:text-xs text-white/50">Today</p>
              <p className="text-base md:text-lg font-semibold text-emerald-400 transition-all duration-300">
                {formatMoney(data.today)}
              </p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl md:rounded-2xl p-3 md:p-4 transition-all duration-300">
              <p className="text-[10px] md:text-xs text-white/50">This Week</p>
              <p className="text-base md:text-lg font-semibold text-white transition-all duration-300">
                {formatMoney(data.week)}
              </p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl md:rounded-2xl p-3 md:p-4 transition-all duration-300">
              <p className="text-[10px] md:text-xs text-white/50">This Month</p>
              <p className="text-base md:text-lg font-semibold text-white transition-all duration-300">
                {formatMoney(data.month)}
              </p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl md:rounded-2xl p-3 md:p-4 transition-all duration-300">
              <p className="text-[10px] md:text-xs text-white/50">All Time</p>
              <p className="text-base md:text-lg font-semibold text-blue-400 transition-all duration-300">
                {formatMoney(data.total)}
              </p>
            </div>
          </div>

          {/* Mini KPI Row (sticky scroll) */}
          <div className="sticky top-0 z-20 -mx-4 md:-mx-8 px-4 md:px-8 py-2 bg-black/80 backdrop-blur-md border-b border-white/10">
            <div
              className="flex gap-3 overflow-x-auto snap-x snap-mandatory"
              style={{
                maskImage: "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
                WebkitMaskImage: "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
              }}
            >
              <div className="min-w-[100px] bg-white/5 border border-white/10 rounded-xl px-3 md:px-4 py-2 md:py-3 text-center flex-shrink-0 snap-start">
                <p className="text-[10px] md:text-xs text-white/40">Avg Tip</p>
                <p className="text-sm font-semibold text-white flex items-center justify-center gap-1">
                  {formatMoney(data.avgTip)}
                  {data.momentum && (
                    <span
                      className={`text-[10px] font-semibold ${
                        data.momentum.direction === "up" ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {data.momentum.direction === "up" ? "↑" : "↓"} {data.momentum.pct}%
                    </span>
                  )}
                </p>
              </div>
              <div className="min-w-[100px] bg-white/5 border border-white/10 rounded-xl px-3 md:px-4 py-2 md:py-3 text-center flex-shrink-0 snap-start">
                <p className="text-[10px] md:text-xs text-white/40">Total Tips</p>
                <p className="text-sm font-semibold text-white">{data.tipCount.toLocaleString()}</p>
              </div>
              {data.bestDay && (
                <div className="min-w-[120px] bg-white/5 border border-white/10 rounded-xl px-3 md:px-4 py-2 md:py-3 text-center flex-shrink-0 snap-start">
                  <p className="text-[10px] md:text-xs text-white/40">Best Day</p>
                  <p className="text-sm font-semibold text-emerald-400">{formatMoney(data.bestDay.volume)}</p>
                  <p className="text-[10px] text-white/30">{data.bestDay.date}</p>
                </div>
              )}
            </div>
          </div>

          {/* Goal System */}
          {goal ? (
            <GoalActive
              goal={goal}
              goalEarnings={goalEarnings}
              onDelete={() => setGoal(null)}
              onComplete={() => setGoal(null)}
            />
          ) : (
            <GoalSetup onCreate={(g) => { setGoal(g); }} />
          )}

          {/* Monthly Summary + Export */}
          {summary && (
            <div className={`${ui.card} p-4 md:p-5 space-y-4`}>
              <h2 className="text-sm font-semibold text-white/80">Earnings Summary</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[summary.month, summary.ytd].map((period) => (
                  <div key={period.label} className="bg-white/5 border border-white/10 rounded-xl p-3 md:p-4">
                    <p className="text-[10px] md:text-xs text-white/40 mb-2">{period.label}</p>
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-white/60">Gross</span>
                        <span className="text-white font-medium">{formatMoney(period.gross)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-white/60">Fees</span>
                        <span className="text-red-400/80">−{formatMoney(period.fees)}</span>
                      </div>
                      <div className="border-t border-white/10 pt-1 flex justify-between text-sm">
                        <span className="text-white/60">Net</span>
                        <span className="text-emerald-400 font-semibold">{formatMoney(period.net)}</span>
                      </div>
                      <p className="text-[10px] text-white/30">{period.count} tip{period.count !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => downloadCSV("30")}
                  disabled={exporting}
                  className={`${ui.btnGhost} text-xs px-3 py-2`}
                >
                  {exporting ? "Exporting…" : "Export Last 30 Days"}
                </button>
                <button
                  onClick={() => downloadCSV("year")}
                  disabled={exporting}
                  className={`${ui.btnGhost} text-xs px-3 py-2`}
                >
                  {exporting ? "Exporting…" : "Export This Year"}
                </button>
                <button
                  onClick={() => downloadCSV("all")}
                  disabled={exporting}
                  className={`${ui.btnGhost} text-xs px-3 py-2`}
                >
                  {exporting ? "Exporting…" : "Export All Time"}
                </button>
              </div>
            </div>
          )}

          {/* Live Tip Feed */}
          <div className={`${ui.card} p-4 md:p-5`}>
            <h2 className="text-sm font-semibold text-white/80 mb-3">Recent Tips</h2>

            {data.recentTips.length === 0 ? (
              <p className="text-sm text-white/40 py-4 text-center">No tips yet</p>
            ) : (
              <div className="space-y-1">
                {data.recentTips.map((tip, i) => (
                  <div
                    key={`${tip.created_at}-${i}`}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition"
                    style={{ animation: `fadeIn 0.3s ease-out ${i * 50}ms both` }}
                  >
                    <span className="text-lg">💰</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-white truncate">
                          {tip.anonymous ? "Anonymous" : tip.tipper_name || "Someone"}
                        </span>
                        <span className="text-sm font-semibold text-emerald-400 flex-shrink-0">
                          +{formatMoney(tip.amount)}
                        </span>
                      </div>
                      {tip.message && (
                        <p className="text-xs text-white/40 truncate">{tip.message}</p>
                      )}
                      <p className="text-[10px] text-white/25">{timeAgo(tip.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
