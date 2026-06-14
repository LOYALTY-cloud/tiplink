"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { CalendarDays, Clock3, Users, Activity, DollarSign, LogIn, LogOut, CheckCircle2, Circle } from "lucide-react";
import { getAdminHeaders, getAdminSession } from "@/lib/auth/adminSession";
import { ui } from "@/lib/ui";

// ── Types ─────────────────────────────────────────────────────────────────────

type TodaySession = {
  id: string;
  started_at: string;
  ended_at: string | null;
  active_seconds: number;
};

type SelfData = {
  today_seconds: number;
  week_seconds: number;
  period_seconds: number;
  period_start: string;
  period_end: string;
  clocked_in: boolean;
  session_started_at: string | null;
  today_sessions: TodaySession[];
};

type WorkforceEntry = {
  user_id: string;
  name: string;
  role: string;
  online: boolean;
  last_active_at: string | null;
  today_hours: number;
  week_hours: number;
  period_hours: number;
  period_pay: number;
  rate: number;
};

type CompanyData = {
  online_count: number;
  today_seconds: number;
  period_seconds: number;
  payroll_estimate: number;
  period_start: string;
  period_end: string;
  workforce: WorkforceEntry[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSecs(seconds: number): string {
  if (seconds <= 0) return "0m";
  const totalMins = Math.round(seconds / 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

function lastSeenText(lastActiveAt: string | null): string {
  if (!lastActiveAt) return "Never";
  const diff = Date.now() - new Date(lastActiveAt).getTime();
  if (diff < 60_000) return "Active now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  sub,
  icon,
  color = "text-white",
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  color?: string;
}) {
  return (
    <div className={`${ui.card} p-5`}>
      <div className="flex items-center gap-2 text-white/40">
        {icon}
        <p className="text-[11px] uppercase tracking-wider">{title}</p>
      </div>
      <p className={`text-3xl font-bold mt-3 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-white/30 mt-1">{sub}</p>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function WorkSchedulePage() {
  const ownerRoles = ["owner", "co_owner", "super_admin"];
  const session    = getAdminSession();
  const isOwner    = ownerRoles.includes(session?.role ?? "");

  const [tab, setTab] = useState<"schedule" | "owner">("schedule");
  const [self, setSelf]       = useState<SelfData | null>(null);
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [now, setNow]         = useState(() => new Date());
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res  = await fetch("/api/admin/workforce", { headers: getAdminHeaders() });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to load"); return; }
      setSelf(json.self);
      setCompany(json.company ?? null);
    } catch {
      setError("Network error");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
    pollRef.current = setInterval(() => void fetchData(true), 30_000);
    const tick = setInterval(() => setNow(new Date()), 10_000);
    return () => { clearInterval(pollRef.current); clearInterval(tick); };
  }, [fetchData]);

  // Payday countdown
  const ANCHOR = new Date("2026-01-05T00:00:00Z").getTime();
  const MS14   = 14 * 24 * 60 * 60 * 1000;
  const idx    = Math.floor((now.getTime() - ANCHOR) / MS14);
  const nextPayday  = new Date(ANCHOR + (idx + 1) * MS14);
  const daysUntil   = Math.ceil((nextPayday.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-6 w-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-red-300 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between fade-up">
        <div>
          <h1 className={ui.h1}>Workforce</h1>
          <p className="text-xs text-white/40 mt-1">
            Work schedule · hours · pay period tracking
          </p>
        </div>

        {/* Payday pill */}
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-2.5 shrink-0">
          <span className="text-lg">💸</span>
          <div className="text-right">
            <p className="text-xs text-white/60">Next payday</p>
            <p className="text-sm font-semibold text-emerald-300">
              {nextPayday.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
              <span className="text-white/40 font-normal ml-1.5">· {daysUntil}d away</span>
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 fade-up">
        <button
          onClick={() => setTab("schedule")}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
            tab === "schedule"
              ? "bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.4)]"
              : "bg-white/[0.06] text-white/60 hover:bg-white/10 hover:text-white"
          }`}
        >
          <span className="flex items-center gap-2">
            <CalendarDays size={15} />
            Work Schedule
          </span>
        </button>

        {isOwner && (
          <button
            onClick={() => setTab("owner")}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
              tab === "owner"
                ? "bg-purple-600 text-white shadow-[0_0_12px_rgba(147,51,234,0.4)]"
                : "bg-white/[0.06] text-white/60 hover:bg-white/10 hover:text-white"
            }`}
          >
            <span className="flex items-center gap-2">
              <Users size={15} />
              Owner Dashboard
            </span>
          </button>
        )}
      </div>

      {/* ── WORK SCHEDULE TAB ─────────────────────────────────────────── */}
      {tab === "schedule" && self && (
        <div className="space-y-5 fade-up">

          {/* Status banner */}
          <div className={`flex items-center justify-between rounded-2xl border px-5 py-3.5 ${
            self.clocked_in
              ? "border-emerald-500/30 bg-emerald-500/[0.07]"
              : "border-white/10 bg-white/[0.03]"
          }`}>
            <div className="flex items-center gap-3">
              {self.clocked_in ? (
                <>
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-emerald-300">Clocked In</p>
                    {self.session_started_at && (
                      <p className="text-xs text-white/40">Since {fmtTime(self.session_started_at)}</p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <span className="h-3 w-3 rounded-full bg-white/20" />
                  <p className="text-sm text-white/50">Clocked Out</p>
                </>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-white/40">Pay period</p>
              <p className="text-xs text-white/60">
                {fmtDate(self.period_start)} → {fmtDate(self.period_end)}
              </p>
            </div>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              title="Today's Hours"
              value={fmtSecs(self.today_seconds)}
              sub="Active work time"
              icon={<Clock3 size={14} />}
              color="text-white"
            />
            <StatCard
              title="This Week"
              value={fmtSecs(self.week_seconds)}
              sub="Mon → today"
              icon={<CalendarDays size={14} />}
              color="text-blue-400"
            />
            <StatCard
              title="Pay Period"
              value={fmtSecs(self.period_seconds)}
              sub="14-day total"
              icon={<Activity size={14} />}
              color="text-purple-400"
            />
            <StatCard
              title="Status"
              value={self.clocked_in ? "Active" : "Off"}
              sub={self.clocked_in ? "Currently working" : "Not clocked in"}
              icon={<Users size={14} />}
              color={self.clocked_in ? "text-emerald-400" : "text-white/40"}
            />
          </div>

          {/* Today's sessions — clock in/out log */}
          <div className={`${ui.card} p-5 space-y-4`}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">Today's Sessions</h2>
              <span className="text-xs text-white/30">{new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</span>
            </div>

            {self.today_sessions.length === 0 ? (
              <p className="text-sm text-white/30 py-3 text-center">No sessions recorded today</p>
            ) : (
              <div className="space-y-2">
                {self.today_sessions.map((s, idx) => (
                  <div key={s.id} className="flex items-center justify-between rounded-xl bg-white/[0.04] border border-white/[0.06] px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-white/20 text-xs font-mono">#{idx + 1}</span>
                      <div className="flex items-center gap-2 text-sm">
                        <LogIn size={13} className="text-emerald-400 shrink-0" />
                        <span className="text-white/80 font-medium">{fmtTime(s.started_at)}</span>
                        <span className="text-white/20 mx-0.5">→</span>
                        {s.ended_at ? (
                          <>
                            <LogOut size={13} className="text-red-400/70 shrink-0" />
                            <span className="text-white/60">{fmtTime(s.ended_at)}</span>
                          </>
                        ) : (
                          <span className="flex items-center gap-1 text-emerald-400 text-xs">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Still active
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-white/70 shrink-0 ml-2">
                      {fmtSecs(s.active_seconds)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-white/[0.06] pt-3 flex justify-between text-xs text-white/40">
              <span>Total active time today</span>
              <span className="font-semibold text-white/70">{fmtSecs(self.today_seconds)}</span>
            </div>
          </div>

          {/* How time is tracked info box */}
          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.05] p-4 space-y-2">
            <p className="text-xs font-semibold text-blue-300 uppercase tracking-wider">How your time is tracked</p>
            <ul className="space-y-1.5 text-xs text-white/50">
              <li className="flex items-start gap-2"><CheckCircle2 size={13} className="text-emerald-400 shrink-0 mt-0.5" />Clicking, typing, and scrolling count as active work time</li>
              <li className="flex items-start gap-2"><CheckCircle2 size={13} className="text-emerald-400 shrink-0 mt-0.5" />Time is logged in real-time — every 20 seconds of activity is recorded</li>
              <li className="flex items-start gap-2"><Circle size={13} className="text-red-400/60 shrink-0 mt-0.5" />Sitting idle or leaving the tab open does <strong className="text-white/60">not</strong> count toward your hours</li>
              <li className="flex items-start gap-2"><Circle size={13} className="text-red-400/60 shrink-0 mt-0.5" />Moving the mouse without clicking does <strong className="text-white/60">not</strong> count</li>
            </ul>
          </div>

        </div>
      )}

      {/* ── OWNER DASHBOARD TAB ───────────────────────────────────────── */}
      {tab === "owner" && isOwner && company && (
        <div className="space-y-5 fade-up">

          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              title="Admins Online"
              value={company.online_count}
              sub="Active right now"
              icon={<Users size={14} />}
              color="text-emerald-400"
            />
            <StatCard
              title="Hours Today"
              value={fmtSecs(company.today_seconds)}
              sub="All staff combined"
              icon={<Clock3 size={14} />}
              color="text-white"
            />
            <StatCard
              title="Pay Period Hours"
              value={fmtSecs(company.period_seconds)}
              sub={`${fmtDate(company.period_start)} → ${fmtDate(company.period_end)}`}
              icon={<Activity size={14} />}
              color="text-blue-400"
            />
            <StatCard
              title="Payroll Estimate"
              value={`$${company.payroll_estimate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              sub="Current period"
              icon={<DollarSign size={14} />}
              color="text-purple-400"
            />
          </div>

          {/* Active Workforce table */}
          <div className={`${ui.card} p-5 space-y-4`}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">Active Workforce</h2>
              <div className="flex items-center gap-1.5 text-xs text-white/40">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live · updates every 30s
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-white/30 border-b border-white/[0.06]">
                    <th className="text-left pb-3 pr-4">Admin</th>
                    <th className="text-center pb-3 pr-4">Status</th>
                    <th className="text-right pb-3 pr-4">Today</th>
                    <th className="text-right pb-3 pr-4">This Week</th>
                    <th className="text-right pb-3 pr-4">Pay Period</th>
                    <th className="text-right pb-3">Est. Pay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {company.workforce.map((w) => (
                    <tr key={w.user_id} className="group hover:bg-white/[0.02] transition">
                      <td className="py-3 pr-4">
                        <div>
                          <p className="font-medium text-white">{w.name}</p>
                          <p className="text-[11px] text-white/30 capitalize mt-0.5">{w.role.replace(/_/g, " ")}</p>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-center">
                        {w.online ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 px-2.5 py-1 text-xs font-medium text-emerald-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] border border-white/10 px-2.5 py-1 text-xs text-white/30">
                            <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
                            {lastSeenText(w.last_active_at)}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right text-white/70 font-medium">
                        {fmtSecs(w.today_hours * 3600)}
                      </td>
                      <td className="py-3 pr-4 text-right text-white/70 font-medium">
                        {fmtSecs(w.week_hours * 3600)}
                      </td>
                      <td className="py-3 pr-4 text-right text-white/80 font-semibold">
                        {fmtSecs(w.period_hours * 3600)}
                      </td>
                      <td className="py-3 text-right text-emerald-400 font-bold">
                        ${w.period_pay.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-white/10">
                  <tr>
                    <td colSpan={4} className="pt-3 text-xs text-white/30">Total</td>
                    <td className="pt-3 text-right text-white/80 font-bold text-sm">
                      {fmtSecs(company.period_seconds)}
                    </td>
                    <td className="pt-3 text-right text-emerald-400 font-bold text-sm">
                      ${company.payroll_estimate.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
