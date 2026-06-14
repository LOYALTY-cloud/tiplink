"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ui } from "@/lib/ui";
import { getAdminHeaders } from "@/lib/auth/adminSession";

type LiveAdmin = {
  admin_id: string;
  name: string;
  role: string;
  hours: number;
  rate: number;
  daily_breakdown?: Array<{ date: string; hours: number; minutes: number }>;
  sessions?: Array<{ id: string; started_at: string; ended_at: string | null; active_seconds: number }>;
};

type PayrollItem = {
  id: string;
  admin_id: string;
  name: string;
  role: string;
  hours: number;
  rate: number;
  total_pay: number;
};

type PayrollRun = {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
  total_amount: number;
  created_at: string;
  paid_at: string | null;
};

// Pay periods — admins are paid twice a week: Mon–Wed and Thu–Sun
const RANGE_LABELS: Record<string, string> = {
  week_first_half:  "1st Half (Mon–Wed)",
  week_second_half: "2nd Half (Thu–Sun)",
  last_period:      "Last Period",
  week:             "Full Week",
  last_week:        "Last Week",
};

const PERIOD_LABEL: Record<string, string> = {
  week_first_half:  "Mon – Wed",
  week_second_half: "Thu – Sun",
  last_period:      "Last period",
  week:             "This week",
  last_week:        "Last week",
  today:            "Today",
};

function fmtHrs(hours: number): string {
  if (hours <= 0) return "0m";
  const totalMins = Math.round(hours * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
}

function fmtActiveSecs(seconds: number): string {
  if (seconds <= 0) return "0m";
  const m = Math.round(seconds / 60);
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}m`;
  if (rem === 0) return `${h}h`;
  return `${h}h ${rem}m`;
}

export default function AdminPayrollPage() {
  const [generating, setGenerating] = useState(false);
  const [marking, setMarking] = useState(false);

  // Current run (just generated)
  const [run, setRun] = useState<PayrollRun | null>(null);
  const [items, setItems] = useState<PayrollItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  // History (always visible)
  const [history, setHistory] = useState<PayrollRun[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Selected history run drill-down
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);
  const [selectedItems, setSelectedItems] = useState<PayrollItem[]>([]);

  // History filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "pending">("all");
  const [dateFilter, setDateFilter] = useState<"all" | "7d" | "30d" | "90d" | "6m" | "1y" | "2y">("all");
  const [sortBy, setSortBy] = useState<"date_desc" | "date_asc" | "amount_desc" | "amount_asc">("date_desc");

  // Admin pay profile modal
  const [adminProfile, setAdminProfile] = useState<{
    admin: { id: string; name: string; role: string; currentRate: number; rateType: string };
    currentWeek: { hours: number; rate: number; estimated_pay: number };
    summary: { total_earned: number; total_hours: number; total_runs: number; paid_runs: number; pending_runs: number };
    payHistory: { id: string; hours: number; rate: number; total_pay: number; created_at: string; run: { start_date: string; end_date: string; status: string; paid_at: string | null } | null }[];
  } | null>(null);
  const [adminProfileLoading, setAdminProfileLoading] = useState(false);

  // Live hours preview (real-time, polls every 30s)
  const [liveRange, setLiveRange] = useState<"today" | "week" | "week_first_half" | "week_second_half" | "last_period">("week_first_half");
  const [liveAdmins, setLiveAdmins] = useState<LiveAdmin[]>([]);
  const [liveLoading, setLiveLoading] = useState(true);
  const [liveUpdated, setLiveUpdated] = useState<Date | null>(null);
  const [liveNow, setLiveNow] = useState(() => new Date());
  const liveFirstLoad = useRef(true);

  const DATE_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90, "6m": 182, "1y": 365, "2y": 730 };

  const filteredHistory = history.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      r.start_date.includes(q) ||
      r.end_date.includes(q) ||
      String(r.total_amount).includes(q);
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    let matchDate = true;
    if (dateFilter !== "all") {
      const days = DATE_DAYS[dateFilter] ?? 30;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      matchDate = new Date(r.created_at) >= cutoff;
    }
    return matchSearch && matchStatus && matchDate;
  });

  const sortedHistory = [...filteredHistory].sort((a, b) => {
    if (sortBy === "date_asc") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (sortBy === "amount_desc") return Number(b.total_amount) - Number(a.total_amount);
    if (sortBy === "amount_asc") return Number(a.total_amount) - Number(b.total_amount);
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); // date_desc default
  });

  useEffect(() => {
    fetchHistory();
  }, []);

  async function fetchHistory(cursor?: string | null) {
    if (cursor) {
      setLoadingMore(true);
    } else {
      setHistoryLoading(true);
    }
    try {
      const params = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const res = await fetch(`/api/admin/payroll/history${params}`, {
        headers: getAdminHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        if (cursor) {
          setHistory((prev) => [...prev, ...(json.runs ?? [])]);
        } else {
          setHistory(json.runs ?? []);
        }
        setHasMore(json.hasMore ?? false);
        setNextCursor(json.nextCursor ?? null);
      }
    } catch {}
    setHistoryLoading(false);
    setLoadingMore(false);
  }

  const fetchLive = useCallback(async (silent = false) => {
    if (!silent) setLiveLoading(true);
    try {
      const res = await fetch(`/api/admin/payroll?range=${liveRange}`, {
        headers: getAdminHeaders(),
      });
      const json = await res.json();
      if (res.ok) {
        setLiveAdmins(json.admins ?? []);
        setLiveUpdated(new Date());
        liveFirstLoad.current = false;
      } else {
        console.error("payroll API error:", json);
        setError(json.error ?? `Failed to load payroll data (${res.status})`);
      }
    } catch (err) {
      console.error("payroll fetch failed:", err);
      setError("Failed to load payroll data. Check your connection.");
    }
    if (!silent) setLiveLoading(false);
  }, [liveRange]);

  // Initial + range-change fetch
  useEffect(() => {
    void fetchLive();
  }, [fetchLive]);

  // Poll every 30s
  useEffect(() => {
    const interval = setInterval(() => void fetchLive(true), 30_000);
    return () => clearInterval(interval);
  }, [fetchLive]);

  // Tick every 10s for "updated X ago"
  useEffect(() => {
    const t = setInterval(() => setLiveNow(new Date()), 10_000);
    return () => clearInterval(t);
  }, []);

  const liveUpdatedLabel = useMemo(() => {
    if (!liveUpdated) return null;
    const secs = Math.floor((liveNow.getTime() - liveUpdated.getTime()) / 1000);
    if (secs < 10) return "just now";
    if (secs < 60) return `${secs}s ago`;
    return `${Math.floor(secs / 60)}m ago`;
  }, [liveUpdated, liveNow]);

  const liveTotal = liveAdmins.reduce((s, a) => s + a.hours * a.rate, 0);

  async function generate(range: string) {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/payroll/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify({ range }),
      });
      if (res.status === 409) {
        const json = await res.json();
        setError(json.error ?? "A run already exists for this period");
      } else if (res.ok) {
        const json = await res.json();
        setRun(json.run);
        setItems(json.items ?? []);
        fetchHistory();
      }
    } catch {}
    setGenerating(false);
  }

  async function markPaid() {
    if (!run || run.status === "paid") return;
    setMarking(true);
    try {
      const res = await fetch("/api/admin/payroll/mark-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify({ payroll_run_id: run.id }),
      });
      if (res.ok) {
        setRun({ ...run, status: "paid", paid_at: new Date().toISOString() });
        fetchHistory();
      }
    } catch {}
    setMarking(false);
  }

  async function exportRun(id: string) {
    const res = await fetch(`/api/admin/payroll/export-run?id=${id}`, {
      headers: getAdminHeaders(),
    });
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-${id}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  async function openRun(id: string) {
    try {
      const res = await fetch(`/api/admin/payroll/run?id=${id}`, {
        headers: getAdminHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        setSelectedRun(json.run);
        setSelectedItems(json.items ?? []);
      }
    } catch {}
  }

  async function openAdminProfile(adminId: string) {
    setAdminProfileLoading(true);
    setAdminProfile(null);
    try {
      const res = await fetch(`/api/admin/payroll/admin-profile?admin_id=${adminId}`, {
        headers: getAdminHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        setAdminProfile(json);
      }
    } catch {}
    setAdminProfileLoading(false);
  }

  const activeAdmins = liveAdmins.filter(
    (a) => (a.sessions?.length ?? 0) > 0
  ).length;

  const totalHours = liveAdmins.reduce(
    (sum, a) => sum + a.hours,
    0
  );

  const avgHourlyRate =
    totalHours > 0
      ? liveTotal / totalHours
      : 0;

  return (
    <div className="space-y-6">
      {/* Header + Generate buttons */}
      <div className="flex items-center justify-between fade-up">
        <div>
          <h1 className={ui.h1}>Payroll Management</h1>
          <p className="text-xs text-white/40 mt-1">
            Finance dashboard · real-time labor cost tracking and earnings monitoring
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <p className="text-[10px] uppercase tracking-wider text-white/30">Generate payroll run</p>
          <div className="flex flex-wrap gap-2 justify-end">
            {Object.entries(RANGE_LABELS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => generate(key)}
                disabled={generating}
                className={`${ui.btnGhost} ${ui.btnSmall} text-xs hover:scale-[1.03] active:scale-[0.98] transition ${
                  key === "week_first_half" || key === "week_second_half"
                    ? "border-emerald-500/30 text-emerald-300"
                    : ""
                }`}
              >
                {generating ? "…" : `+ ${label}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Workforce Activity KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 fade-up">
        <div className={`${ui.card} p-5`}>
          <p className="text-[11px] uppercase tracking-wider text-white/40">
            Active Payroll
          </p>
          <p className="text-3xl font-bold text-emerald-400 mt-2">
            {liveLoading ? <span className="text-emerald-400/20 animate-pulse">$—</span> : `$${liveTotal.toFixed(2)}`}
          </p>
          <p className="text-xs text-white/30 mt-1">
            Current tracked earnings
          </p>
        </div>

        <div className={`${ui.card} p-5`}>
          <p className="text-[11px] uppercase tracking-wider text-white/40">
            Active Work Hours
          </p>
          <p className="text-3xl font-bold text-white mt-2">
            {liveLoading ? <span className="text-white/20 animate-pulse">—</span> : totalHours.toFixed(1)}
          </p>
          <p className="text-xs text-white/30 mt-1">
            Tracked activity time
          </p>
        </div>

        <div className={`${ui.card} p-5`}>
          <p className="text-[11px] uppercase tracking-wider text-white/40">
            Staff Working
          </p>
          <p className="text-3xl font-bold text-blue-400 mt-2">
            {liveLoading ? <span className="text-blue-400/20 animate-pulse">—</span> : activeAdmins}
          </p>
          <p className="text-xs text-white/30 mt-1">
            Active this period
          </p>
        </div>

        <div className={`${ui.card} p-5`}>
          <p className="text-[11px] uppercase tracking-wider text-white/40">
            Avg Hourly Cost
          </p>
          <p className="text-3xl font-bold text-purple-400 mt-2">
            {liveLoading ? <span className="text-purple-400/20 animate-pulse">$—</span> : `$${avgHourlyRate.toFixed(2)}`}
          </p>
          <p className="text-xs text-white/30 mt-1">
            Average pay rate
          </p>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center justify-between bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 fade-up">
          <p className="text-sm text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 text-xs ml-3">✕</button>
        </div>
      )}

      {/* Payroll Overview */}
      <div className={`${ui.card} p-5 space-y-4 fade-up`}>
        <div className="flex items-center justify-between">
          <div>
            <div>
              <h2 className="text-xl font-semibold text-white">
                Workforce Activity
              </h2>
              <p className="text-sm text-white/40">
                {PERIOD_LABEL[liveRange] ?? liveRange} · active tracked work time
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={liveRange}
              onChange={(e) => setLiveRange(e.target.value as typeof liveRange)}
              className="bg-[#0B1220] border border-white/10 rounded-md text-xs px-2 py-1 text-white outline-none focus:border-emerald-500/50 transition"
            >
              <option value="week_first_half"  className="bg-[#0B1220] text-white">1st Half (Mon–Wed)</option>
              <option value="week_second_half" className="bg-[#0B1220] text-white">2nd Half (Thu–Sun)</option>
              <option value="today"            className="bg-[#0B1220] text-white">Today</option>
              <option value="week"             className="bg-[#0B1220] text-white">Full Week</option>
              <option value="last_period"      className="bg-[#0B1220] text-white">Last Period</option>
            </select>
            <button
              onClick={() => void fetchLive()}
              className="text-[10px] text-white/30 hover:text-white/60 transition px-1.5 py-1 rounded border border-white/10 hover:border-white/20"
            >
              ↻
            </button>
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-emerald-400 uppercase tracking-wider">
              Live
            </span>
          </div>
        </div>

        <div className="border-t border-white/10" />

        {liveLoading && liveAdmins.length === 0 ? (
          <div className="flex items-center justify-center py-4">
            <div className="h-4 w-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-3 max-h-[480px] overflow-y-auto pr-0.5">
            {liveAdmins.length === 0 && (
              <p className="text-xs text-white/30 text-center py-3">No session data for this period</p>
            )}
            {/* Admins with activity first — premium cards */}
            {liveAdmins.filter((a) => (a.daily_breakdown?.length ?? 0) > 0 || (a.sessions?.length ?? 0) > 0).map((a) => (
              <div
                key={a.admin_id}
                onClick={() => openAdminProfile(a.admin_id)}
                className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] p-4 hover:border-emerald-500/30 hover:bg-white/[0.06] transition cursor-pointer"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-white font-semibold">
                      {a.name}
                    </h3>
                    <p className="text-[11px] text-white/40 capitalize mt-0.5">{a.role.replace(/_/g, " ")}</p>

                    <div className="mt-2 inline-flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-emerald-500" />
                      <span className="text-xs text-emerald-400">
                        Active
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-2xl font-bold text-emerald-400">
                      ${(a.hours * a.rate).toFixed(2)}
                    </p>
                    <p className="text-xs text-white/30">
                      Estimated Pay
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mt-5">
                  <div>
                    <p className="text-[10px] uppercase text-white/30">
                      Active Time
                    </p>
                    <p className="text-white font-medium">
                      {fmtHrs(a.hours)}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] uppercase text-white/30">
                      Rate
                    </p>
                    <p className="text-white font-medium">
                      ${a.rate.toFixed(2)}/hr
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] uppercase text-white/30">
                      Sessions
                    </p>
                    <p className="text-white font-medium">
                      {a.sessions?.length ?? 0}
                    </p>
                  </div>
                </div>

                {/* Session clock-in / clock-out timeline */}
                {(a.sessions?.length ?? 0) > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <p className="text-[10px] uppercase text-white/30 tracking-wider">Clock In / Out</p>
                    {a.sessions!.map((s, idx) => (
                      <div key={s.id} className="flex items-center justify-between text-xs bg-white/[0.04] rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-white/30 shrink-0">#{idx + 1}</span>
                          <span className="text-white/70 font-medium">{fmtTime(s.started_at)}</span>
                          <span className="text-white/20">→</span>
                          {s.ended_at ? (
                            <span className="text-white/60">{fmtTime(s.ended_at)}</span>
                          ) : (
                            <span className="text-emerald-400 flex items-center gap-1">
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              Active
                            </span>
                          )}
                        </div>
                        <span className="text-white/50 font-medium shrink-0 ml-3">
                          {fmtActiveSecs(s.active_seconds)} worked
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Per-day breakdown (multi-day views) */}
                {(liveRange === "week" || liveRange === "week_first_half" || liveRange === "week_second_half" || liveRange === "last_period") && (a.daily_breakdown?.length ?? 0) > 0 && (
                  <div className="mt-3 space-y-1">
                    <p className="text-[10px] uppercase text-white/30 tracking-wider">Daily Breakdown</p>
                    {a.daily_breakdown!.map((d) => (
                      <div key={d.date} className="flex items-center justify-between text-xs bg-white/[0.03] rounded-lg px-3 py-1.5">
                        <span className="text-white/40">
                          {new Date(d.date + "T12:00:00Z").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                        </span>
                        <span className="text-white/70 font-medium">
                          {d.minutes}m
                          <span className="text-white/30 font-normal ml-1">({d.hours}h)</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {/* Admins with no activity — dimmed */}
            {liveAdmins.filter((a) => (a.daily_breakdown?.length ?? 0) === 0 && (a.sessions?.length ?? 0) === 0).map((a) => (
              <div
                key={a.admin_id}
                onClick={() => openAdminProfile(a.admin_id)}
                className="flex items-center justify-between bg-white/[0.02] border border-white/[0.06] rounded-xl px-4 py-3 opacity-40 cursor-pointer hover:opacity-60 transition"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white/60 truncate">{a.name}</p>
                  <p className="text-[10px] text-white/25 capitalize">{a.role.replace(/_/g, " ")}</p>
                </div>
                <p className="text-xs text-white/25 shrink-0">No activity</p>
              </div>
            ))}
          </div>
        )}
      </div>


      {run && (
        <div className={`${ui.card} p-5 space-y-4 fade-up border border-white/10 hover:border-white/20 transition`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className={ui.h2}>
                Run: {run.start_date} → {run.end_date}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`text-xs font-bold uppercase px-2 py-0.5 rounded border ${
                    run.status === "paid"
                      ? "bg-green-500/10 border-green-500/20 text-green-400"
                      : "bg-yellow-500/10 border-yellow-500/20 text-yellow-400"
                  }`}
                >
                  {run.status}
                </span>
                <span className="text-sm text-white/60">
                  Total:{" "}
                  <span className="text-emerald-400 font-semibold drop-shadow-[0_0_6px_rgba(16,185,129,0.4)]">
                    ${run.total_amount.toFixed(2)}
                  </span>
                </span>
                {run.paid_at && (
                  <span className="text-xs text-white/40">
                    Paid {new Date(run.paid_at).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => { setRun(null); setItems([]); }}
              className={`${ui.btnGhost} ${ui.btnSmall} text-xs`}
            >
              ✕ Close
            </button>
          </div>

          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {items.map((i, idx) => (
              <div
                key={i.id ?? idx}
                onClick={() => openAdminProfile(i.admin_id)}
                style={{ animation: `fadeUp 0.3s ease ${idx * 40}ms both` }}
                className="flex justify-between items-center bg-white/5 border border-white/10 rounded-lg px-4 py-3 hover:bg-white/10 hover:scale-[1.01] transition cursor-pointer"
              >
                <div>
                  <p className="text-sm text-white font-medium">{i.name}</p>
                  <p className="text-xs text-white/30 capitalize">{i.role?.replace(/_/g, " ")}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-white/60">
                    {fmtHrs(i.hours)} × ${i.rate.toFixed(2)}
                  </p>
                  <p className="text-sm text-emerald-400 font-semibold">
                    ${i.total_pay.toFixed(2)}
                  </p>
                </div>
              </div>
            ))}
            {items.length === 0 && (
              <p className={`text-sm ${ui.muted2} text-center py-4`}>No items in this run.</p>
            )}
          </div>

          {run.status === "pending" && (
            <button
              onClick={markPaid}
              disabled={marking}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg py-2.5 text-sm font-medium text-white transition hover:shadow-[0_0_12px_rgba(16,185,129,0.4)] active:scale-[0.98]"
            >
              {marking ? "Marking…" : "Mark as Paid ✅"}
            </button>
          )}
        </div>
      )}

      {/* Payroll History — always visible */}
      <div className={`${ui.card} p-5 space-y-4`}>
        <h3 className="text-sm text-white/60">Payroll History</h3>

        {/* Filters */}
        {history.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              placeholder="Search date or amount…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-md px-2 py-1 text-xs text-white placeholder:text-white/30 w-[160px] outline-none focus:border-blue-400/50 focus:ring-1 focus:ring-blue-400/30 transition"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | "paid" | "pending")}
              className="bg-zinc-900 border border-white/10 rounded-md px-2 py-1 text-xs text-white cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
            </select>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as typeof dateFilter)}
              className="bg-zinc-900 border border-white/10 rounded-md px-2 py-1 text-xs text-white cursor-pointer"
            >
              <option value="all">All Time</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 3 months</option>
              <option value="6m">Last 6 months</option>
              <option value="1y">Last year</option>
              <option value="2y">Last 2 years</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="bg-zinc-900 border border-white/10 rounded-md px-2 py-1 text-xs text-white cursor-pointer"
            >
              <option value="date_desc">Newest</option>
              <option value="date_asc">Oldest</option>
              <option value="amount_desc">Highest Amount</option>
              <option value="amount_asc">Lowest Amount</option>
            </select>
          </div>
        )}

        {historyLoading && history.length === 0 && (
          <div className="flex items-center justify-center py-6">
            <div className="h-5 w-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {!historyLoading && history.length === 0 && (
          <p className={`text-sm ${ui.muted2} text-center py-8`}>
            No payroll runs yet. Generate one using the buttons above.
          </p>
        )}

        {/* Runs list */}
        <div className="space-y-2 max-h-[480px] overflow-y-auto">
          {sortedHistory.length === 0 && history.length > 0 && (
            <p className="text-xs text-white/30 text-center py-4">No matching payroll runs</p>
          )}
          {sortedHistory.map((r, idx) => (
            <button
              key={r.id}
              onClick={() => openRun(r.id)}
              style={{ animation: `fadeUp 0.3s ease ${idx * 50}ms both` }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:scale-[1.01] transition text-left ${
                selectedRun?.id === r.id ? "ring-1 ring-blue-500/40 bg-white/10" : ""
              }`}
            >
              <div>
                <p className="text-sm text-white">
                  {r.start_date} → {r.end_date}
                </p>
                <p className="text-[10px] text-white/30">
                  {new Date(r.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-emerald-400 drop-shadow-[0_0_6px_rgba(16,185,129,0.3)]">
                  ${Number(r.total_amount).toFixed(2)}
                </p>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full ${
                    r.status === "paid"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-yellow-500/10 text-yellow-400"
                  }`}
                >
                  {r.status}
                </span>
              </div>
            </button>
          ))}

          {/* Load more */}
          {hasMore && (
            <button
              onClick={() => fetchHistory(nextCursor)}
              disabled={loadingMore}
              className="w-full text-center py-2 text-xs text-blue-400 hover:text-blue-300 transition disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : "Load older runs ↓"}
            </button>
          )}
        </div>

        {/* Selected run drill-down */}
        {selectedRun && (
          <div className="border-t border-white/10 pt-4 space-y-3 fade-up">
            <div className="flex justify-between items-center">
              <p className="text-sm text-white">
                {selectedRun.start_date} → {selectedRun.end_date}
              </p>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs px-2 py-1 rounded ${
                    selectedRun.status === "paid"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-yellow-500/10 text-yellow-400"
                  }`}
                >
                  {selectedRun.status}
                </span>
                <button
                  onClick={() => exportRun(selectedRun.id)}
                  className="text-xs text-blue-400 hover:text-blue-300 underline"
                >
                  Export CSV
                </button>
                <button
                  onClick={() => { setSelectedRun(null); setSelectedItems([]); }}
                  className="text-xs text-white/40 hover:text-white/60"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-[220px] overflow-y-auto">
              {selectedItems.map((i) => (
                <div
                  key={i.id}
                  onClick={() => openAdminProfile(i.admin_id)}
                  className="flex justify-between bg-white/5 border border-white/10 rounded-lg px-3 py-2 hover:bg-white/10 hover:scale-[1.01] transition cursor-pointer"
                >
                  <div>
                    <p className="text-sm text-white">{i.name}</p>
                    <p className="text-xs text-white/30 capitalize">{i.role?.replace(/_/g, " ")}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-white/60">
                      {fmtHrs(Number(i.hours))} × ${i.rate}
                    </p>
                    <p className="text-sm text-emerald-400 font-semibold drop-shadow-[0_0_6px_rgba(16,185,129,0.3)]">
                      ${Number(i.total_pay).toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {selectedRun.paid_at && (
              <p className="text-[10px] text-white/30 text-right">
                Paid on {new Date(selectedRun.paid_at).toLocaleString()}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Admin Pay Profile Modal */}
      {(adminProfile || adminProfileLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setAdminProfile(null); setAdminProfileLoading(false); }}>
          <div
            className={`${ui.card} w-full max-w-lg mx-4 p-6 space-y-5 fade-up max-h-[85vh] overflow-y-auto`}
            onClick={(e) => e.stopPropagation()}
          >
            {adminProfileLoading && !adminProfile && (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              </div>
            )}

            {adminProfile && (
              <>
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className={ui.h2}>{adminProfile.admin.name}</h2>
                    <p className="text-xs text-white/40 capitalize mt-0.5">
                      {adminProfile.admin.role.replace(/_/g, " ")} · ${adminProfile.admin.currentRate}/hr
                      <span className="text-white/20 ml-1">({adminProfile.admin.rateType})</span>
                    </p>
                  </div>
                  <button
                    onClick={() => setAdminProfile(null)}
                    className="text-white/40 hover:text-white/60 text-sm"
                  >
                    ✕
                  </button>
                </div>

                {/* Current Week */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
                  <p className="text-xs text-white/50 uppercase tracking-wider font-medium">Current Week</p>
                  <div className="flex items-baseline gap-3">
                    <span className="text-2xl font-semibold text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]">
                      ${adminProfile.currentWeek.estimated_pay.toFixed(2)}
                    </span>
                    <span className="text-sm text-white/50">
                      {fmtHrs(adminProfile.currentWeek.hours)} × ${adminProfile.currentWeek.rate.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Summary Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-center">
                    <p className="text-lg font-semibold text-white">${adminProfile.summary.total_earned.toFixed(2)}</p>
                    <p className="text-[10px] text-white/40 uppercase">Total Earned</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-center">
                    <p className="text-lg font-semibold text-white">{fmtHrs(adminProfile.summary.total_hours)}</p>
                    <p className="text-[10px] text-white/40 uppercase">Total Hours</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-center">
                    <p className="text-lg font-semibold text-white">{adminProfile.summary.total_runs}</p>
                    <p className="text-[10px] text-white/40 uppercase">
                      Runs
                      <span className="text-emerald-400 ml-1">{adminProfile.summary.paid_runs}✓</span>
                      {adminProfile.summary.pending_runs > 0 && (
                        <span className="text-yellow-400 ml-1">{adminProfile.summary.pending_runs}⏳</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Pay History */}
                <div className="space-y-2">
                  <p className="text-xs text-white/50 uppercase tracking-wider font-medium">Pay History</p>
                  <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
                    {adminProfile.payHistory.length === 0 && (
                      <p className="text-xs text-white/30 text-center py-4">No pay history yet</p>
                    )}
                    {adminProfile.payHistory.map((p, idx) => (
                      <div
                        key={p.id}
                        style={{ animation: `fadeUp 0.25s ease ${idx * 30}ms both` }}
                        className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-3 py-2"
                      >
                        <div>
                          <p className="text-sm text-white">
                            {p.run ? `${p.run.start_date} → ${p.run.end_date}` : "Unknown period"}
                          </p>
                          <p className="text-[10px] text-white/30">
                            {fmtHrs(Number(p.hours))} × ${p.rate}/hr
                            {p.run && (
                              <span className={`ml-2 ${p.run.status === "paid" ? "text-emerald-400" : "text-yellow-400"}`}>
                                {p.run.status}
                              </span>
                            )}
                          </p>
                        </div>
                        <p className="text-sm text-emerald-400 font-semibold drop-shadow-[0_0_6px_rgba(16,185,129,0.3)]">
                          ${Number(p.total_pay).toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
