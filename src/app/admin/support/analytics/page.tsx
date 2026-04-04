"use client";

import { useEffect, useState } from "react";
import { getAdminHeaders } from "@/lib/auth/adminSession";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type Agent = {
  admin_id: string;
  name: string;
  sessions: number;
  avgMin: number;
};

type Analytics = {
  totalSessions: number;
  activeSessions: number;
  waitingSessions: number;
  todaySessions: number;
  avgResolution: number;
  avgResponse: number;
  closeReasons: Record<string, number>;
  topAgents: Agent[];
  trend: { date: string; count: number }[];
  aiSessions: number;
  humanSessions: number;
  aiToHumanConversions: number;
};

export default function SupportAnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/support/analytics", { headers: getAdminHeaders() })
      .then((res) => res.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-4 text-white/40 text-sm">Loading analytics…</div>;
  }

  if (!data || data.totalSessions == null) {
    return <div className="p-4 text-red-400 text-sm">Failed to load analytics</div>;
  }

  const closeTotal =
    (data.closeReasons.admin || 0) +
    (data.closeReasons.user || 0) +
    (data.closeReasons.system || 0);

  return (
    <div className="p-4 text-white space-y-6">
      <h1 className="text-lg font-semibold">Support Analytics</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Total Sessions" value={data.totalSessions} />
        <Card label="Today" value={data.todaySessions} accent />
        <Card
          label="Avg Response"
          value={formatResponseTime(data.avgResponse)}
          sub="first admin reply"
        />
        <Card
          label="Avg Resolution"
          value={`${data.avgResolution}m`}
          sub="session duration"
        />
      </div>

      {/* Live status */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <p className="text-xs text-emerald-400">Active Now</p>
          <p className="text-2xl font-bold text-emerald-400">{data.activeSessions}</p>
        </div>
        <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
          <p className="text-xs text-yellow-400">Waiting</p>
          <p className="text-2xl font-bold text-yellow-400">{data.waitingSessions}</p>
        </div>
      </div>

      {/* AI vs Human mode breakdown */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <p className="text-xs text-blue-400">AI Handled (30d)</p>
          <p className="text-2xl font-bold text-blue-400">{data.aiSessions}</p>
        </div>
        <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
          <p className="text-xs text-purple-400">Human Handled (30d)</p>
          <p className="text-2xl font-bold text-purple-400">{data.humanSessions}</p>
        </div>
        <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/20">
          <p className="text-xs text-orange-400">AI → Human (30d)</p>
          <p className="text-2xl font-bold text-orange-400">{data.aiToHumanConversions}</p>
          <p className="text-[10px] text-white/30 mt-0.5">conversions</p>
        </div>
      </div>

      {/* Trend chart */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-4">
        <h2 className="text-sm font-medium text-white/60 mb-3">Sessions (Last 30 Days)</h2>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.trend}>
              <defs>
                <linearGradient id="sessGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: "#111",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "rgba(255,255,255,0.5)" }}
                itemStyle={{ color: "#10b981" }}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#sessGrad)"
                name="Sessions"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Close reasons + Leaderboard side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Close reasons */}
        <div className="rounded-xl bg-white/5 border border-white/10 p-4">
          <h2 className="text-sm font-medium text-white/60 mb-3">Close Reasons (30d)</h2>
          {closeTotal === 0 ? (
            <p className="text-xs text-white/30">No closed sessions yet</p>
          ) : (
            <div className="space-y-2">
              <ReasonBar label="Admin" count={data.closeReasons.admin || 0} total={closeTotal} color="bg-blue-500" />
              <ReasonBar label="User" count={data.closeReasons.user || 0} total={closeTotal} color="bg-emerald-500" />
              <ReasonBar label="System" count={data.closeReasons.system || 0} total={closeTotal} color="bg-white/30" />
            </div>
          )}
        </div>

        {/* Admin leaderboard */}
        <div className="rounded-xl bg-white/5 border border-white/10 p-4">
          <h2 className="text-sm font-medium text-white/60 mb-3">Top Agents (30d)</h2>
          {data.topAgents.length === 0 ? (
            <p className="text-xs text-white/30">No agent data yet</p>
          ) : (
            <div className="space-y-2">
              {data.topAgents.map((a, i) => (
                <div key={a.admin_id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold w-5 text-center ${i === 0 ? "text-yellow-400" : i === 1 ? "text-white/50" : "text-white/30"}`}>
                      {i + 1}
                    </span>
                    <span className="text-white/80 truncate max-w-[120px]">{a.name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-white/50">{a.sessions} sessions</span>
                    <span className="text-white/30">~{a.avgMin}m avg</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
      <p className="text-xs text-white/60">{label}</p>
      <p className={`text-lg font-semibold ${accent ? "text-emerald-400" : ""}`}>{value}</p>
      {sub && <p className="text-[10px] text-white/30 mt-0.5">{sub}</p>}
    </div>
  );
}

function ReasonBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-white/60">{label}</span>
        <span className="text-white/40">{count} ({pct}%)</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function formatResponseTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}
