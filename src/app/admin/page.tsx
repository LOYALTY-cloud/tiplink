"use client";

import { useEffect, useState } from "react";
import { supabaseAdmin as supabase } from "@/lib/supabase/adminBrowserClient";
import { getAdminHeaders } from "@/lib/auth/adminSession";
import { ui } from "@/lib/ui";
import Link from "next/link";
import { getRoleBadge } from "@/lib/ui/roleBadge";
import { dispatchAIContext } from "@/lib/dispatchAIContext";

type Stats = {
  totalUsers: number;
  restrictedUsers: number;
  pendingRefunds: number;
  activeDisputes: number;
  totalOwed: number;
};

type Alert = {
  id: string;
  message: string;
  severity: "critical" | "warning" | "info";
};

type FeedItem = {
  id: string;
  action: string;
  label: string;
  severity: string;
  target_user: string | null;
  target_handle: string | null;
  target_display_name: string | null;
  created_at: string;
  actor: string;
  role: string;
};

type RiskAlert = {
  id: string;
  user_id: string;
  type: string;
  message: string;
  severity: string;
  resolved: boolean;
  created_at: string;
};

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [panicOpen, setPanicOpen] = useState(false);
  const [panicResult, setPanicResult] = useState<string | null>(null);
  const [panicLoading, setPanicLoading] = useState(false);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [riskAlerts, setRiskAlerts] = useState<RiskAlert[]>([]);
  const [riskAlertsLoading, setRiskAlertsLoading] = useState(false);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [supportStats, setSupportStats] = useState({ tickets: 0, activeChats: 0, waitingChats: 0 });
  const [expandedFeed, setExpandedFeed] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
    loadFeed();
    loadRiskAlerts();
    loadSupportStats();

    // Poll every 20s — avoids 3 unfiltered realtime subs on broad tables
    const interval = setInterval(() => {
      loadStats();
      loadSupportStats();
    }, 20_000);

    return () => { clearInterval(interval); };
  }, []);

  async function loadStats() {
    const headers = getAdminHeaders();
    if (!headers["X-Admin-Id"]) return;

    let res: Response;
    try {
      res = await fetch("/api/admin/stats", { headers });
    } catch {
      return;
    }
    if (!res.ok) return;

    const d = await res.json();

    const newStats: Stats = {
      totalUsers: d.totalUsers,
      restrictedUsers: d.restrictedUsers,
      pendingRefunds: d.pendingRefunds,
      activeDisputes: d.activeDisputes,
      totalOwed: d.totalOwed,
    };
    setStats(newStats);
    dispatchAIContext({
      total_users: newStats.totalUsers,
      restricted_users: newStats.restrictedUsers,
      pending_refunds: newStats.pendingRefunds,
      active_disputes: newStats.activeDisputes,
      total_owed: newStats.totalOwed,
    });

    // Build system alerts
    const newAlerts: Alert[] = [];

    if (d.recentDisputeCount >= 3) {
      newAlerts.push({
        id: "disputes-spike",
        message: `${d.recentDisputeCount} disputes in the last hour — investigate immediately`,
        severity: "critical",
      });
    } else if (d.recentDisputeCount >= 1) {
      newAlerts.push({
        id: "disputes-recent",
        message: `${d.recentDisputeCount} new dispute(s) in the last hour`,
        severity: "warning",
      });
    }

    if (d.staleRefundCount > 0) {
      newAlerts.push({
        id: "stale-refunds",
        message: `${d.staleRefundCount} refund(s) stuck in "initiated" for >10 min — may need retry`,
        severity: "warning",
      });
    }

    if (d.owedCount > 0) {
      newAlerts.push({
        id: "negative-balances",
        message: `${d.owedCount} user(s) with outstanding owed balance ($${d.totalOwed.toFixed(2)} total)`,
        severity: (d.totalOwed > 100 ? "critical" : "warning") as Alert["severity"],
      });
    }

    setAlerts(newAlerts);
  }

  async function loadFeed() {
    setFeedLoading(true);
    try {
      const headers = getAdminHeaders();
      if (!headers["X-Admin-Id"]) { setFeedLoading(false); return; }
      const res = await fetch("/api/admin/activity-feed?limit=25", {
        headers,
      });
      if (res.ok) {
        const json = await res.json();
        setFeed(json.data ?? []);
      }
    } catch { /* ignore */ } finally {
      setFeedLoading(false);
    }
  }

  async function loadRiskAlerts() {
    setRiskAlertsLoading(true);
    try {
      const headers = getAdminHeaders();
      if (!headers["X-Admin-Id"]) { setRiskAlertsLoading(false); return; }
      const res = await fetch("/api/admin/risk-alerts?resolved=false&limit=20", {
        headers,
      });
      if (res.ok) {
        const json = await res.json();
        setRiskAlerts(json.data ?? []);
      }
    } catch { /* ignore */ } finally {
      setRiskAlertsLoading(false);
    }
  }

  async function loadSupportStats() {
    try {
      const headers = getAdminHeaders();
      if (!headers["X-Admin-Id"]) return;
      const res = await fetch("/api/admin/support/overview", { headers });
      if (res.ok) {
        const json = await res.json();
        setSupportStats(json);
      }
    } catch { /* ignore */ }
  }

  async function dismissRiskAlert(alertId: string) {
    setDismissing(alertId);
    try {
      const headers = getAdminHeaders();
      if (!headers["X-Admin-Id"]) { setDismissing(null); return; }
      const res = await fetch("/api/admin/risk-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ alert_id: alertId }),
      });
      if (res.ok) {
        setRiskAlerts((prev) => prev.filter((a) => a.id !== alertId));
      }
    } catch { /* ignore */ } finally {
      setDismissing(null);
    }
  }

  async function executeBulkRestrict() {
    setPanicLoading(true);
    const headers = getAdminHeaders();
    if (!headers["X-Admin-Id"]) return;

    try {
      const res = await fetch("/api/admin/bulk-restrict", {
        method: "POST",
        headers,
      });
      const json = await res.json();
      setPanicResult(
        res.ok
          ? `Restricted ${json.restricted} user(s).`
          : `Error: ${json.error}`
      );
    } catch {
      setPanicResult("Network error — bulk restrict failed");
    } finally {
      setPanicLoading(false);
      setPanicOpen(false);
      loadStats();
    }
  }

  function alertStyle(severity: Alert["severity"]) {
    switch (severity) {
      case "critical":
        return "bg-red-500/10 border-red-400/20 text-red-400";
      case "warning":
        return "bg-yellow-500/10 border-yellow-400/20 text-yellow-400";
      default:
        return "bg-blue-500/10 border-blue-400/20 text-blue-300";
    }
  }

  return (
    <div className="space-y-6">
      <h1 className={ui.h1}>Admin Overview</h1>

      {/* System Alerts Panel */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a) => (
            <div
              key={a.id}
              className={`${ui.card} p-3 border text-sm font-medium ${alertStyle(a.severity)}`}
            >
              {a.severity === "critical" ? "🔴" : "⚠️"} {a.message}
            </div>
          ))}
        </div>
      )}

      {/* Stats cards */}
      {!stats ? (
        <p className={ui.muted}>Loading stats…</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Total Users" value={String(stats.totalUsers)} href="/admin/users" />
          <StatCard
            label="Restricted / Suspended"
            value={String(stats.restrictedUsers)}
            href="/admin/users?filter=restricted"
            color="text-yellow-400"
          />
          <StatCard
            label="Pending Refunds"
            value={String(stats.pendingRefunds)}
            href="/admin/refunds?filter=initiated"
            color="text-orange-400"
          />
          <StatCard
            label="Active Disputes"
            value={String(stats.activeDisputes)}
            href="/admin/disputes"
            color="text-red-400"
          />
          <StatCard
            label="Total Owed"
            value={`$${stats.totalOwed.toFixed(2)}`}
            href="/admin/users?filter=flagged"
            color="text-red-400"
          />
        </div>
      )}

      {/* Support Overview */}
      <div>
        <h2 className={`${ui.h2} mb-3`}>Support Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Link href="/admin/tickets" className={`${ui.card} p-5 hover:border-white/20 transition block`}>
            <p className={`text-sm ${ui.muted2}`}>🎫 Pending Tickets</p>
            <p className={`text-2xl font-bold mt-1 ${supportStats.tickets > 0 ? "text-orange-400" : "text-white"}`}>
              {supportStats.tickets}
            </p>
          </Link>
          <Link href="/admin/support" className={`${ui.card} p-5 hover:border-white/20 transition block`}>
            <p className={`text-sm ${ui.muted2}`}>💬 Active Chats</p>
            <p className="text-2xl font-bold mt-1 text-white">
              {supportStats.activeChats}
            </p>
          </Link>
          <Link
            href="/admin/support"
            className={`${ui.card} p-5 hover:border-white/20 transition block ${
              supportStats.waitingChats > 0 ? "border-yellow-500/30 bg-yellow-500/5" : ""
            }`}
          >
            <p className={`text-sm ${ui.muted2}`}>⏳ Waiting Chats</p>
            <p className={`text-2xl font-bold mt-1 ${supportStats.waitingChats > 0 ? "text-yellow-400" : "text-white"}`}>
              {supportStats.waitingChats}
            </p>
            {supportStats.waitingChats > 0 && (
              <p className="text-xs text-yellow-400/70 mt-1">Users need help now</p>
            )}
          </Link>
        </div>
      </div>

      {/* Risk Alerts */}
      <div>
        <h2 className={`${ui.h2} mb-3`}>
          Risk Alerts
          {riskAlerts.length > 0 && (
            <span className="ml-2 text-xs px-2 py-0.5 rounded-full font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
              {riskAlerts.length}
            </span>
          )}
        </h2>
        {riskAlertsLoading ? (
          <p className={ui.muted}>Loading risk alerts…</p>
        ) : riskAlerts.length === 0 ? (
          <p className={ui.muted}>No active risk alerts.</p>
        ) : (
          <div className="space-y-2">
            {riskAlerts.map((ra) => (
              <div
                key={ra.id}
                className={`${ui.card} p-3 border text-sm ${
                  ra.severity === "critical"
                    ? "bg-red-500/10 border-red-400/20"
                    : "bg-yellow-500/10 border-yellow-400/20"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        ra.severity === "critical"
                          ? "bg-red-500/20 text-red-400"
                          : "bg-yellow-500/20 text-yellow-400"
                      }`}>
                        {ra.type.replace(/_/g, " ")}
                      </span>
                      <span className={`text-xs ${ui.muted2}`}>
                        {new Date(ra.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className={ra.severity === "critical" ? "text-red-300" : "text-yellow-300"}>
                      {ra.message}
                    </p>
                    <Link
                      href={`/admin/users/${ra.user_id}`}
                      className={`text-xs ${ui.muted2} hover:text-white underline mt-1 inline-block`}
                    >
                      View user →
                    </Link>
                  </div>
                  <button
                    onClick={() => dismissRiskAlert(ra.id)}
                    disabled={dismissing === ra.id}
                    className={`${ui.btnGhost} ${ui.btnSmall} shrink-0 ml-3`}
                  >
                    {dismissing === ra.id ? "…" : "Dismiss"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Activity Feed */}
      <div>
        <h2 className={`${ui.h2} mb-3`}>Activity Feed</h2>
        {feedLoading ? (
          <p className={ui.muted}>Loading activity…</p>
        ) : feed.length === 0 ? (
          <p className={ui.muted}>No recent admin activity.</p>
        ) : (
          <div className="space-y-2">
            {feed.map((f) => {
              const badge = getRoleBadge(f.role);
              const severityDot =
                f.severity === "critical" ? "bg-red-400" :
                f.severity === "warning" ? "bg-yellow-400" :
                "bg-blue-400";
              const isExpanded = expandedFeed === f.id;
              return (
                <div key={f.id} className={`${ui.card} transition-all duration-200 ${isExpanded ? "ring-1 ring-white/10" : "hover:bg-white/[.02]"}`}>
                  <button
                    type="button"
                    onClick={() => setExpandedFeed(isExpanded ? null : f.id)}
                    className="w-full text-left p-3"
                  >
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`w-2 h-2 rounded-full ${severityDot}`} />
                      <span className={`text-xs ${ui.muted2}`}>{f.actor}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${badge.className}`}>
                        {badge.label}
                      </span>
                      <span className={`text-xs ${ui.muted2} ml-auto`}>
                        {new Date(f.created_at).toLocaleString()}
                      </span>
                      <span className={`text-xs text-white/30 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}>▾</span>
                    </div>
                    <p className="text-sm">{f.label}</p>
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 pt-1 border-t border-white/5 space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-white/40">Action</p>
                          <p className="text-white font-medium">{f.action.replace(/_/g, " ")}</p>
                        </div>
                        <div>
                          <p className="text-white/40">Severity</p>
                          <span className={`inline-block px-2 py-0.5 rounded-full font-semibold ${
                            f.severity === "critical" ? "bg-red-500/10 text-red-400" :
                            f.severity === "warning" ? "bg-yellow-500/10 text-yellow-400" :
                            "bg-blue-500/10 text-blue-400"
                          }`}>
                            {f.severity}
                          </span>
                        </div>
                        <div>
                          <p className="text-white/40">Performed by</p>
                          <p className="text-white font-medium">{f.actor}</p>
                        </div>
                        <div>
                          <p className="text-white/40">Timestamp</p>
                          <p className="text-white font-medium">{new Date(f.created_at).toLocaleString()}</p>
                        </div>
                      </div>
                      {f.target_user && (
                        <Link
                          href={`/admin/users/${f.target_user}`}
                          className="flex items-center gap-2 p-2 rounded-lg bg-white/[.03] hover:bg-white/[.06] border border-white/5 transition group"
                        >
                          <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-xs font-semibold text-white shrink-0">
                            {(f.target_handle || f.target_display_name || "U").charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white truncate">
                              {f.target_display_name || f.target_handle || `User ${f.target_user.slice(0, 8)}…`}
                            </p>
                            {f.target_handle && (
                              <p className="text-xs text-white/40">@{f.target_handle}</p>
                            )}
                          </div>
                          <span className="text-xs text-blue-400 ml-auto group-hover:text-blue-300 transition">View profile →</span>
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Panic Button */}
      <div className={`${ui.card} p-4 border-red-500/20`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-sm text-red-400">🚨 Emergency: Restrict All Flagged Users</p>
            <p className={`text-xs ${ui.muted2} mt-0.5`}>
              Immediately restricts all users with owed balance or active disputes
            </p>
          </div>
          <button
            onClick={() => setPanicOpen(true)}
            className={`${ui.btnSmall} rounded-lg px-4 py-2 font-semibold text-white bg-red-600 hover:bg-red-500 transition`}
          >
            Restrict All Flagged
          </button>
        </div>
        {panicResult && (
          <p className={`text-sm mt-2 ${panicResult.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
            {panicResult}
          </p>
        )}
      </div>

      {/* Panic Confirmation Modal */}
      {panicOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${ui.card} p-6 w-full max-w-[440px] space-y-4`}>
            <h2 className="text-lg font-semibold text-red-400">
              🚨 Confirm Bulk Restriction
            </h2>
            <p className={`text-sm ${ui.muted}`}>
              This will set <span className="text-white font-semibold">account_status = &quot;restricted&quot;</span> for
              all users who have an owed balance &gt; $0 or any active disputes.
            </p>
            <p className="text-xs text-red-400">
              This action is logged and affects real accounts. Are you sure?
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setPanicOpen(false)}
                className={`${ui.btnGhost} ${ui.btnSmall}`}
              >
                Cancel
              </button>
              <button
                onClick={executeBulkRestrict}
                disabled={panicLoading}
                className={`${ui.btnSmall} rounded-lg px-4 py-2 font-semibold text-white bg-red-600 hover:bg-red-500 transition disabled:opacity-50`}
              >
                {panicLoading ? "Restricting…" : "Confirm — Restrict All"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  href,
  color,
}: {
  label: string;
  value: string;
  href: string;
  color?: string;
}) {
  return (
    <Link href={href} className={`${ui.card} p-5 hover:border-white/20 transition block`}>
      <p className={`text-sm ${ui.muted2}`}>{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color ?? "text-white"}`}>{value}</p>
    </Link>
  );
}
