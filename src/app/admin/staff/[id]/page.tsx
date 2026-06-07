"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ui } from "@/lib/ui";
import { getAdminHeaders, getAdminSession } from "@/lib/auth/adminSession";
import { supabaseAdmin } from "@/lib/supabase/adminBrowserClient";
import { isAdminOnline, lastSeenText } from "@/lib/isAdminOnline";

type AdminDetail = {
  id: string;
  user_id: string;
  full_name: string | null;
  role: string;
  status: string;
  restricted_until: string | null;
  created_at: string;
  last_login_at: string | null;
  admin_id_display: string | null;
  email: string | null;
  availability: string;
  last_active_at: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type AdminStats = {
  total_actions: number;
  actions_today: number;
  restrictions_issued: number;
  overrides: number;
};

type PerformanceData = {
  actions_week: number;
  avg_actions_day: number;
  tickets_resolved: number;
  critical_week: number;
};

type ModerationData = {
  themes_approved_today: number;
  themes_rejected_today: number;
  themes_approved_range: number;
  themes_rejected_range: number;
  themes_approved_total: number;
  themes_rejected_total: number;
  themes_auto_removed_total: number;
  range_from: string;
  range_to: string;
  seven_day_breakdown: { date: string; approved: number; rejected: number }[];
};

type RiskData = {
  score: number;
  level: string;
  factors: { label: string; points: number }[];
};

type ActionEntry = {
  id: string;
  action: string;
  target_user: string | null;
  reason: string | null;
  severity: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

type TicketEntry = {
  id: string;
  type: string;
  message: string;
  status: string;
  created_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  auto_generated: boolean;
  from_role: string;
  to_role: string;
  from_admin: { id: string; full_name: string } | null;
};

type AssignmentEntry = {
  id: string;
  role: string;
  action: "assigned" | "removed" | "role_changed";
  performed_by_name: string | null;
  reason: string | null;
  created_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  active: "text-green-400",
  restricted: "text-yellow-400",
  suspended: "text-red-400",
  terminated: "text-white/30",
};

const SEVERITY_COLORS: Record<string, string> = {
  info: "border-blue-500/30",
  warning: "border-yellow-500/30",
  critical: "border-red-500/30",
};

const TICKET_TYPE_COLORS: Record<string, string> = {
  warning: "text-red-400 bg-red-500/10 border-red-500/20",
  performance_review: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  policy_violation: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  escalation: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  note: "text-blue-400 bg-blue-500/10 border-blue-500/20",
};

const TICKET_TYPE_ICONS: Record<string, string> = {
  warning: "⚠️",
  performance_review: "📋",
  policy_violation: "🚨",
  escalation: "📈",
  note: "📝",
};

const TICKET_STATUS_COLORS: Record<string, string> = {
  open: "text-yellow-400",
  acknowledged: "text-blue-400",
  resolved: "text-green-400",
};

export default function AdminStaffDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminDetail | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [performance, setPerformance] = useState<PerformanceData | null>(null);
  const [moderation, setModeration] = useState<ModerationData | null>(null);
  const [modFrom, setModFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [modTo,   setModTo]   = useState(() => new Date().toISOString().slice(0, 10));
  const [risk, setRisk] = useState<RiskData | null>(null);
  const [lastAction, setLastAction] = useState<{ action: string; created_at: string; target_user: string | null } | null>(null);
  const [actions, setActions] = useState<ActionEntry[]>([]);
  const [tickets, setTickets] = useState<TicketEntry[]>([]);
  const [assignments, setAssignments] = useState<AssignmentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Remove Admin (fire) modal state
  const [removeModal, setRemoveModal] = useState(false);
  const [removeReason, setRemoveReason] = useState("");
  const [removeConfirmText, setRemoveConfirmText] = useState("");
  const [removeLoading, setRemoveLoading] = useState(false);

  // Action modal state
  const [actionType, setActionType] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [actionDuration, setActionDuration] = useState("24h");
  const [actionLoading, setActionLoading] = useState(false);

  // Ticket modal state
  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticketType, setTicketType] = useState("performance_review");
  const [ticketMessage, setTicketMessage] = useState("");
  const [ticketLoading, setTicketLoading] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const session = getAdminSession();
  const isOwner = session?.role === "owner";
  const isSuperAdmin = session?.role === "super_admin";
  const canControl = isOwner || isSuperAdmin;
  const [authorized, setAuthorized] = useState(false);
  const canSendTicket = !!session && !!admin && session.id !== admin.user_id;

  useEffect(() => {
    if (!session || !["owner", "super_admin", "finance_admin", "support_admin"].includes(session.role)) { router.replace("/admin"); return; }
    setAuthorized(true);
  }, [router]);

  useEffect(() => {
    if (authorized) loadAdmin();
  }, [id, authorized]);

  // Realtime availability for this admin
  useEffect(() => {
    if (!admin?.user_id) return;
    const channel = supabaseAdmin
      .channel(`staff-avail-${admin.user_id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `user_id=eq.${admin.user_id}` },
        (payload) => {
          const updated = payload.new as { availability?: string; last_active_at?: string };
          setAdmin((prev) => prev ? {
            ...prev,
            ...(updated.availability && { availability: updated.availability }),
            ...(updated.last_active_at && { last_active_at: updated.last_active_at }),
          } : prev);
        }
      )
      .subscribe();

    return () => { supabaseAdmin.removeChannel(channel); };
  }, [admin?.user_id]);

  async function loadAdmin(from?: string, to?: string) {
    setLoading(true);
    try {
      const qFrom = from ?? modFrom;
      const qTo   = to   ?? modTo;
      const res = await fetch(`/api/admin/staff/${id}?from=${qFrom}&to=${qTo}`, { headers: getAdminHeaders() });
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setAdmin(data.admin);
      setStats(data.stats);
      setPerformance(data.performance ?? null);
      setModeration(data.moderation ?? null);
      setRisk(data.risk ?? null);
      setLastAction(data.last_action ?? null);
      setActions(data.actions ?? []);
      setTickets(data.tickets ?? []);
      setAssignments(data.assignments ?? []);
    } catch {
      setError("Failed to load admin profile");
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveAdmin() {
    if (!admin || !removeReason.trim() || removeConfirmText !== "REMOVE") return;
    setRemoveLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/remove-admin", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify({ admin_id: admin.id, reason: removeReason }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to remove admin"); return; }
      router.push("/admin/staff");
    } catch {
      setError("Failed to remove admin");
    } finally {
      setRemoveLoading(false);
    }
  }

  async function handleStatusChange() {
    if (!admin || !actionType || !actionReason.trim()) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/manage/status", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify({
          adminId: admin.id,
          status: actionType,
          duration: actionType === "restricted" ? actionDuration : undefined,
          reason: actionReason.trim(),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Failed");
        return;
      }
      setActionType("");
      setActionReason("");
      loadAdmin();
    } catch {
      setError("Failed to update status");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSendTicket() {
    if (!admin || !ticketMessage.trim()) return;
    setTicketLoading(true);
    try {
      const res = await fetch("/api/admin/staff/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify({
          toAdminId: admin.id,
          type: ticketType,
          message: ticketMessage.trim(),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Failed");
        return;
      }
      setTicketOpen(false);
      setTicketMessage("");
      loadAdmin();
    } catch {
      setError("Failed to send ticket");
    } finally {
      setTicketLoading(false);
    }
  }

  async function handleResolveTicket(ticketId: string) {
    try {
      const res = await fetch("/api/admin/staff/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify({ ticketId, action: "resolve" }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Failed to resolve ticket");
      }
      loadAdmin();
    } catch {
      setError("Network error resolving ticket");
    }
  }

  async function handleAcknowledgeTicket(ticketId: string) {
    try {
      const res = await fetch("/api/admin/staff/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify({ ticketId, action: "acknowledge" }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Failed to acknowledge ticket");
      }
      loadAdmin();
    } catch {
      setError("Network error acknowledging ticket");
    }
  }

  function formatTime(iso: string | null) {
    if (!iso) return "Never";
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    if (diffMs < 60_000) return "Just now";
    if (diffMs < 3600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
    if (d.toDateString() === now.toDateString()) return `Today ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    return d.toLocaleDateString();
  }

  if (loading) {
    return !authorized ? null : (
      <div className="flex items-center justify-center py-20">
        <p className={ui.muted}>Loading…</p>
      </div>
    );
  }

  if (!admin) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className={`text-red-400`}>Admin not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back */}
      <button onClick={() => router.push("/admin/staff")} className={`${ui.btnGhost} ${ui.btnSmall} text-xs`}>
        ← Back to Staff
      </button>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
          {error}
          <button onClick={() => setError("")} className="ml-2 text-red-400 hover:text-red-300">✕</button>
        </div>
      )}

      {/* Header */}
      <div className={`${ui.card} p-6`}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            {admin.avatar_url ? (
              <img src={admin.avatar_url} alt="" className="w-14 h-14 rounded-full object-cover" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center text-xl font-bold">
                {(admin.full_name ?? "?")[0].toUpperCase()}
              </div>
            )}
            <div>
              <h1 className={`${ui.h2}`}>{admin.full_name || "Unnamed Admin"}</h1>
              <p className={`text-sm ${ui.muted} capitalize`}>{admin.role}</p>
              {admin.admin_id_display && (
                <p className="text-xs font-mono text-white/40 mt-0.5">{admin.admin_id_display}</p>
              )}
              {admin.email && (
                <p className={`text-xs ${ui.muted2} mt-0.5`}>{admin.email}</p>
              )}
            </div>
          </div>
          <div className="text-right">
            <span className={`text-sm font-medium capitalize ${STATUS_COLORS[admin.status] ?? ui.muted2}`}>
              {admin.status}
            </span>
            {admin.status === "restricted" && admin.restricted_until && (
              <p className={`text-xs ${ui.muted2} mt-0.5`}>
                Until {new Date(admin.restricted_until).toLocaleString()}
              </p>
            )}
            {/* Real-time presence */}
            <p className={`text-xs mt-1 ${isAdminOnline(admin.last_active_at) ? "text-green-400" : "text-white/40"}`}>
              {isAdminOnline(admin.last_active_at)
                ? (admin.availability === "busy" ? "🟡 Busy" : "🟢 Online")
                : `⚪ ${lastSeenText(admin.last_active_at)}`
              }
            </p>
            <p className={`text-xs ${ui.muted2} mt-0.5`}>
              Last login: {formatTime(admin.last_login_at)}
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className={`${ui.card} p-4 text-center`}>
            <p className="text-2xl font-bold">{stats.actions_today}</p>
            <p className={`text-xs ${ui.muted2}`}>Actions Today</p>
          </div>
          <div className={`${ui.card} p-4 text-center`}>
            <p className="text-2xl font-bold">{stats.total_actions}</p>
            <p className={`text-xs ${ui.muted2}`}>Total Actions</p>
          </div>
          <div className={`${ui.card} p-4 text-center`}>
            <p className="text-2xl font-bold">{stats.restrictions_issued}</p>
            <p className={`text-xs ${ui.muted2}`}>Restrictions Issued</p>
          </div>
          <div className={`${ui.card} p-4 text-center`}>
            <p className="text-2xl font-bold">{stats.overrides}</p>
            <p className={`text-xs ${ui.muted2}`}>Overrides</p>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {actions.length > 0 && (
        <div className={`${ui.card} p-5 space-y-3`}>
          <div className="flex items-center justify-between">
            <p className={`text-xs ${ui.muted2} uppercase tracking-wider`}>Recent Activity</p>
            <span className="text-[10px] text-white/30">{actions.length} total</span>
          </div>
          <div className="space-y-1">
            {actions.slice(0, 4).map((a, i) => {
              const icon =
                a.action.includes("ticket") ? "🎫" :
                a.action.includes("withdraw") || a.action.includes("payout") ? "💰" :
                a.action.includes("user") || a.action.includes("account") ? "👤" : "⚙️";
              return (
                <div
                  key={a.id}
                  className={`flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/5 transition border-l-2 ${SEVERITY_COLORS[a.severity] ?? "border-white/10"}`}
                  style={{ animation: `fadeIn 0.3s ease-out ${i * 60}ms both` }}
                >
                  <span className="text-xs">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white truncate">{a.action.replace(/_/g, " ")}</p>
                    {a.target_user && (
                      <p className="text-[10px] text-white/30 truncate">Target: {a.target_user}</p>
                    )}
                  </div>
                  <span className={`text-[10px] ${ui.muted2} shrink-0`}>{formatTime(a.created_at)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Performance Panel */}
      {performance && (
        <div className={`${ui.card} p-5 space-y-3`}>
          <h2 className="text-sm font-semibold text-blue-400 uppercase tracking-wider">📊 Performance</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <p className="text-xl font-bold">{performance.actions_week}</p>
              <p className={`text-[10px] ${ui.muted2}`}>Actions / Week</p>
            </div>
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <p className="text-xl font-bold">{performance.avg_actions_day}</p>
              <p className={`text-[10px] ${ui.muted2}`}>Avg / Day</p>
            </div>
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <p className="text-xl font-bold">{performance.tickets_resolved}</p>
              <p className={`text-[10px] ${ui.muted2}`}>Tickets Resolved</p>
            </div>
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <p className={`text-xl font-bold ${(performance.critical_week ?? 0) > 0 ? "text-red-400" : ""}`}>
                {performance.critical_week}
              </p>
              <p className={`text-[10px] ${ui.muted2}`}>Critical / Week</p>
            </div>
          </div>
        </div>
      )}

      {/* Moderation Stats — owner/super_admin only, non-owner admins */}
      {moderation && (isOwner || isSuperAdmin) && admin.role !== "owner" && (
        <div className={`${ui.card} p-5 space-y-4`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-sm font-semibold text-purple-400 uppercase tracking-wider">🎨 Marketplace Moderation</h2>
            {/* Date range picker */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs ${ui.muted2}`}>View range:</span>
              <input
                type="date"
                value={modFrom}
                max={modTo}
                onChange={(e) => setModFrom(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-purple-500/50"
              />
              <span className={`text-xs ${ui.muted2}`}>→</span>
              <input
                type="date"
                value={modTo}
                min={modFrom}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setModTo(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-purple-500/50"
              />
              <button
                onClick={() => loadAdmin(modFrom, modTo)}
                className="bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/30 text-purple-200 text-xs px-3 py-1 rounded-lg transition"
              >
                Apply
              </button>
              <button
                onClick={() => {
                  const today = new Date().toISOString().slice(0, 10);
                  setModFrom(today); setModTo(today);
                  loadAdmin(today, today);
                }}
                className={`${ui.btnGhost} text-xs px-2 py-1`}
              >
                Today
              </button>
              <button
                onClick={() => {
                  const to = new Date().toISOString().slice(0, 10);
                  const from = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
                  setModFrom(from); setModTo(to);
                  loadAdmin(from, to);
                }}
                className={`${ui.btnGhost} text-xs px-2 py-1`}
              >
                7 days
              </button>
            </div>
          </div>

          {/* Summary tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <p className={`text-xl font-bold ${moderation.themes_approved_today === 0 ? "text-white/30" : "text-emerald-400"}`}>
                {moderation.themes_approved_today}
              </p>
              <p className={`text-[10px] ${ui.muted2}`}>Approved Today</p>
            </div>
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <p className={`text-xl font-bold ${moderation.themes_rejected_today === 0 ? "text-white/30" : "text-red-400"}`}>
                {moderation.themes_rejected_today}
              </p>
              <p className={`text-[10px] ${ui.muted2}`}>Rejected Today</p>
            </div>
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-emerald-400">{moderation.themes_approved_total}</p>
              <p className={`text-[10px] ${ui.muted2}`}>Approved All-Time</p>
            </div>
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-red-400">{moderation.themes_rejected_total}</p>
              <p className={`text-[10px] ${ui.muted2}`}>Rejected All-Time</p>
            </div>
          </div>

          {/* Selected range summary */}
          {(moderation.range_from !== moderation.range_to || moderation.range_from !== new Date().toISOString().slice(0, 10)) && (
            <div className="flex items-center gap-3 text-xs bg-purple-500/10 border border-purple-500/20 rounded-xl px-4 py-2">
              <span className="text-purple-300 font-medium">
                {moderation.range_from} → {moderation.range_to}
              </span>
              <span className="text-emerald-400">✓ {moderation.themes_approved_range} approved</span>
              <span className="text-red-400">✕ {moderation.themes_rejected_range} rejected</span>
              <span className={`ml-auto font-medium ${(moderation.themes_approved_range + moderation.themes_rejected_range) === 0 ? "text-orange-400" : "text-white/50"}`}>
                {(moderation.themes_approved_range + moderation.themes_rejected_range) === 0 ? "⚠ No decisions in range" : `${moderation.themes_approved_range + moderation.themes_rejected_range} total decisions`}
              </span>
            </div>
          )}

          {/* 7-day daily breakdown table */}
          {moderation.seven_day_breakdown && moderation.seven_day_breakdown.length > 0 && (
            <div>
              <p className={`text-xs ${ui.muted2} mb-2 uppercase tracking-wider`}>Last 7 Days</p>
              <div className="space-y-1">
                {moderation.seven_day_breakdown.map((day) => {
                  const total = day.approved + day.rejected;
                  const isToday = day.date === new Date().toISOString().slice(0, 10);
                  return (
                    <div
                      key={day.date}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs ${isToday ? "bg-white/10 border border-white/10" : "bg-white/5"}`}
                    >
                      <span className={`w-20 shrink-0 font-mono ${isToday ? "text-white font-semibold" : "text-white/50"}`}>
                        {isToday ? "Today" : new Date(day.date + "T12:00:00").toLocaleDateString([], { month: "short", day: "numeric" })}
                      </span>
                      {total === 0 ? (
                        <span className="text-white/20 italic">No decisions</span>
                      ) : (
                        <>
                          <span className="text-emerald-400">✓ {day.approved}</span>
                          <span className="text-red-400">✕ {day.rejected}</span>
                          {/* Mini bar */}
                          <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: `${Math.round((day.approved / total) * 100)}%` }}
                            />
                          </div>
                          <span className="text-white/40 shrink-0">{total} total</span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {moderation.themes_auto_removed_total > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-300 text-xs">
              <span>⚠️</span>
              <span>
                <strong>{moderation.themes_auto_removed_total}</strong> theme{moderation.themes_auto_removed_total !== 1 ? "s" : ""} auto-removed platform-wide (no decision within 48h).
                {moderation.themes_approved_today === 0 && moderation.themes_rejected_today === 0 && (
                  <span className="block mt-0.5 text-orange-300/70">This moderator made no decisions today.</span>
                )}
              </span>
            </div>
          )}
          {moderation.themes_approved_total === 0 && moderation.themes_rejected_total === 0 && (
            <p className={`text-xs ${ui.muted2} italic`}>No marketplace moderation actions on record.</p>
          )}
        </div>
      )}

      {/* Risk Assessment — owner/super_admin view, not shown for owners */}
      {risk && admin.role !== "owner" && canControl && (
        <div className={`${ui.card} p-5 space-y-3 ${
          risk.level === "critical" ? "border-red-500/30" :
          risk.level === "high" ? "border-orange-500/30" :
          risk.level === "medium" ? "border-yellow-500/30" : ""
        }`}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-orange-400 uppercase tracking-wider">🛡️ Risk Assessment</h2>
            <div className="flex items-center gap-2">
              <div className="w-24 h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    risk.level === "critical" ? "bg-red-500" :
                    risk.level === "high" ? "bg-orange-500" :
                    risk.level === "medium" ? "bg-yellow-500" : "bg-green-500"
                  }`}
                  style={{ width: `${risk.score}%` }}
                />
              </div>
              <span className={`text-sm font-bold ${
                risk.level === "critical" ? "text-red-400" :
                risk.level === "high" ? "text-orange-400" :
                risk.level === "medium" ? "text-yellow-400" : "text-green-400"
              }`}>
                {risk.score}/100
              </span>
              <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${
                risk.level === "critical" ? "bg-red-500/20 text-red-400" :
                risk.level === "high" ? "bg-orange-500/20 text-orange-400" :
                risk.level === "medium" ? "bg-yellow-500/20 text-yellow-400" :
                "bg-green-500/20 text-green-400"
              }`}>
                {risk.level}
              </span>
            </div>
          </div>
          {risk.factors.length > 0 ? (
            <div className="space-y-1">
              {risk.factors.map((f, i) => (
                <div key={i} className="flex items-center justify-between text-xs bg-white/5 rounded-lg px-3 py-1.5">
                  <span className="text-white/70">{f.label}</span>
                  <span className={`font-mono font-bold ${f.points >= 20 ? "text-red-400" : f.points >= 10 ? "text-yellow-400" : "text-white/50"}`}>
                    +{f.points}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className={`text-sm ${ui.muted2}`}>No risk factors detected. Clean record.</p>
          )}
        </div>
      )}

      {/* Control Panel — owner + super_admin, not for owners */}
      {canControl && admin.role !== "owner" && (
        <div className={`${ui.card} p-5 space-y-3`}>
          <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wider">Control Panel</h2>
          <div className="flex flex-wrap gap-2">
            {admin.status === "active" && (
              <>
                <button
                  onClick={() => { setActionType("restricted"); setActionDuration("1h"); }}
                  className={`${ui.btnGhost} ${ui.btnSmall} text-xs text-yellow-400`}
                >
                  Restrict (1h)
                </button>
                <button
                  onClick={() => { setActionType("restricted"); setActionDuration("24h"); }}
                  className={`${ui.btnGhost} ${ui.btnSmall} text-xs text-yellow-400`}
                >
                  Restrict (24h)
                </button>
                <button
                  onClick={() => { setActionType("restricted"); setActionDuration("7d"); }}
                  className={`${ui.btnGhost} ${ui.btnSmall} text-xs text-yellow-400`}
                >
                  Restrict (7d)
                </button>
                <button
                  onClick={() => setActionType("suspended")}
                  className={`${ui.btnGhost} ${ui.btnSmall} text-xs text-red-400`}
                >
                  Suspend
                </button>
                <button
                  onClick={() => setActionType("terminated")}
                  className={`${ui.btnGhost} ${ui.btnSmall} text-xs text-red-300`}
                >
                  Terminate
                </button>
              </>
            )}
            {(admin.status === "restricted" || admin.status === "suspended") && (
              <button
                onClick={() => setActionType("active")}
                className={`${ui.btnGhost} ${ui.btnSmall} text-xs text-green-400`}
              >
                Reactivate
              </button>
            )}
            {/* Remove Admin — owner only */}
            {isOwner && (
              <button
                onClick={() => { setRemoveModal(true); setRemoveReason(""); setRemoveConfirmText(""); }}
                className={`${ui.btnGhost} ${ui.btnSmall} text-xs text-red-500 border-red-500/30 hover:border-red-500/60 ml-auto`}
              >
                🔥 Remove Admin Access
              </button>
            )}
          </div>

          {/* Inline reason input + confirm */}
          {actionType && (
            <div className="mt-3 space-y-2 pt-3 border-t border-white/10">
              <p className={`text-sm ${ui.muted}`}>
                {actionType === "active" ? "Reactivating" :
                 actionType === "restricted" ? `Restricting (${actionDuration})` :
                 actionType === "suspended" ? "Suspending" : "Terminating"}{" "}
                <strong>{admin.full_name}</strong>
              </p>
              <textarea
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                className={`${ui.input} min-h-[60px]`}
                placeholder="Reason (required)…"
              />
              {(actionType === "suspended" || actionType === "terminated") && (
                <div>
                  <label className="text-xs text-red-400 mb-1 block">
                    Type <span className="font-mono font-bold">{actionType === "suspended" ? "SUSPEND" : "TERMINATE"}</span> to confirm
                  </label>
                  <input
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    className={`${ui.input} border-red-500/30 focus:border-red-500/50 text-sm`}
                    placeholder={actionType === "suspended" ? "SUSPEND" : "TERMINATE"}
                  />
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => { setActionType(""); setActionReason(""); setConfirmText(""); }} className={`${ui.btnGhost} ${ui.btnSmall} text-xs`}>
                  Cancel
                </button>
                <button
                  onClick={handleStatusChange}
                  disabled={
                    actionLoading ||
                    !actionReason.trim() ||
                    ((actionType === "suspended" || actionType === "terminated") &&
                      confirmText !== (actionType === "suspended" ? "SUSPEND" : "TERMINATE"))
                  }
                  className={`${ui.btnPrimary} ${ui.btnSmall} text-xs`}
                >
                  {actionLoading ? "…" : "Confirm"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Discipline Record — hierarchy-enforced ticket system */}
      <div className={`${ui.card} p-5 space-y-3`}>
        <div className="flex items-center justify-between">
          <h2 className={`${ui.h2} text-base`}>Discipline Record</h2>
          <div className="flex items-center gap-2">
            <span className={ui.chip}>
              {tickets.filter((t) => t.status === "open").length} open
            </span>
            <span className={ui.chip}>{tickets.length} total</span>
            {/* Any admin-level user can file a record against any other admin-level user except themselves. */}
            {canSendTicket && (
              <button
                onClick={() => setTicketOpen(true)}
                className={`${ui.btnGhost} ${ui.btnSmall} text-xs text-blue-400`}
              >
                + New Ticket
              </button>
            )}
          </div>
        </div>
        {tickets.length === 0 ? (
          <p className={`text-sm ${ui.muted2}`}>No discipline records for this admin.</p>
        ) : (
          <div className="space-y-2">
            {tickets.map((t) => (
              <div key={t.id} className={`${ui.cardInner} p-4 space-y-2`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{TICKET_TYPE_ICONS[t.type] ?? "📄"}</span>
                    <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded border ${TICKET_TYPE_COLORS[t.type] ?? "text-white/50"}`}>
                      {t.type.replace("_", " ")}
                    </span>
                    {t.auto_generated && (
                      <span className="text-[10px] font-mono bg-white/10 px-1.5 py-0.5 rounded text-white/40">AUTO</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium capitalize ${TICKET_STATUS_COLORS[t.status] ?? ui.muted2}`}>
                      {t.status}
                    </span>
                    <span className={`text-xs ${ui.muted2}`}>{formatTime(t.created_at)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <span className={ui.muted2}>
                    From: <strong className="text-white/70">{t.from_admin?.full_name ?? "System"}</strong>
                    <span className="ml-1 capitalize">({t.from_role})</span>
                  </span>
                </div>

                <p className="text-sm leading-relaxed">{t.message}</p>

                {/* Acknowledgement info */}
                {t.acknowledged_at && (
                  <p className="text-xs text-blue-400/70">
                    ✓ Acknowledged {formatTime(t.acknowledged_at)}
                  </p>
                )}
                {t.resolved_at && (
                  <p className="text-xs text-green-400/70">
                    ✓ Resolved {formatTime(t.resolved_at)}
                  </p>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  {t.status === "open" && (
                    <button
                      onClick={() => handleAcknowledgeTicket(t.id)}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      Acknowledge
                    </button>
                  )}
                  {(t.status === "open" || t.status === "acknowledged") && (isOwner || t.from_admin?.id) && (
                    <button
                      onClick={() => handleResolveTicket(t.id)}
                      className="text-xs text-green-400 hover:text-green-300"
                    >
                      Resolve
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Activity Timeline */}
      <div className={`${ui.card} p-5 space-y-3`}>
        <h2 className={`${ui.h2} text-base`}>Action History</h2>
        {actions.length === 0 ? (
          <p className={`text-sm ${ui.muted2}`}>No actions recorded.</p>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {actions.map((a) => (
              <div key={a.id} className={`${ui.cardInner} p-3 border-l-2 ${SEVERITY_COLORS[a.severity] ?? "border-white/10"}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{a.action}</span>
                  <span className={`text-xs ${ui.muted2}`}>{formatTime(a.created_at)}</span>
                </div>
                {a.reason && <p className={`text-xs ${ui.muted} mt-0.5`}>{a.reason}</p>}
                {a.target_user && (
                  <p className={`text-xs ${ui.muted2} mt-0.5`}>Target: {a.target_user}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Admin Assignment History */}
      <div className={`${ui.card} p-5 space-y-3`}>
        <h2 className={`${ui.h2} text-base`}>Assignment History</h2>
        {assignments.length === 0 ? (
          <p className={`text-sm ${ui.muted2}`}>No assignment records found.</p>
        ) : (
          <div className="space-y-2">
            {assignments.map((a) => (
              <div
                key={a.id}
                className={`${ui.cardInner} p-3 border-l-2 ${
                  a.action === "assigned" ? "border-green-500/40" :
                  a.action === "removed" ? "border-red-500/40" : "border-blue-500/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold uppercase px-1.5 py-0.5 rounded ${
                      a.action === "assigned" ? "bg-green-500/15 text-green-400" :
                      a.action === "removed" ? "bg-red-500/15 text-red-400" :
                      "bg-blue-500/15 text-blue-400"
                    }`}>
                      {a.action === "assigned" ? "Granted" : a.action === "removed" ? "Revoked" : "Changed"}
                    </span>
                    <span className="text-xs text-white/70 capitalize">{a.role.replace("_", " ")}</span>
                  </div>
                  <span className={`text-xs ${ui.muted2}`}>{formatTime(a.created_at)}</span>
                </div>
                {a.performed_by_name && (
                  <p className={`text-xs ${ui.muted2} mt-0.5`}>By: <span className="text-white/60">{a.performed_by_name}</span></p>
                )}
                {a.reason && <p className={`text-xs ${ui.muted} mt-0.5`}>{a.reason}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Remove Admin Confirmation Modal */}
      {removeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className={`${ui.card} p-6 max-w-md w-full mx-4 space-y-4 border border-red-500/30`}>
            <h2 className={`${ui.h2} text-red-400`}>🔥 Remove Admin Access</h2>
            <p className={`text-sm ${ui.muted}`}>
              This will <strong className="text-red-300">permanently revoke admin access</strong> for{" "}
              <strong>{admin?.full_name}</strong>. Their account will be demoted to a regular user.
              This action is logged and cannot be undone.
            </p>
            <div>
              <label className={`text-sm ${ui.muted} mb-1 block`}>Reason (required)</label>
              <textarea
                value={removeReason}
                onChange={(e) => setRemoveReason(e.target.value)}
                className={`${ui.input} min-h-[80px]`}
                placeholder="Explain why this admin is being removed…"
              />
            </div>
            <div>
              <label className="text-xs text-red-400 mb-1 block">
                Type <span className="font-mono font-bold">REMOVE</span> to confirm
              </label>
              <input
                value={removeConfirmText}
                onChange={(e) => setRemoveConfirmText(e.target.value.toUpperCase())}
                className={`${ui.input} border-red-500/30 focus:border-red-500/60 text-sm font-mono`}
                placeholder="REMOVE"
              />
            </div>
            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
                {error}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setRemoveModal(false); setRemoveReason(""); setRemoveConfirmText(""); setError(""); }}
                className={`${ui.btnGhost} flex-1`}
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveAdmin}
                disabled={removeLoading || !removeReason.trim() || removeConfirmText !== "REMOVE"}
                className={`${ui.btnPrimary} flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-40`}
              >
                {removeLoading ? "Removing…" : "Remove Admin Access"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send Discipline Ticket Modal */}
      {ticketOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className={`${ui.card} p-6 max-w-md w-full mx-4 space-y-4`}>
            <h2 className={ui.h2}>New Discipline Ticket</h2>
            <p className={`text-sm ${ui.muted}`}>
              To: <strong>{admin.full_name}</strong> <span className="capitalize">({admin.role})</span>
            </p>
            <div>
              <label className={`text-sm ${ui.muted} mb-1 block`}>Type</label>
              <select
                value={ticketType}
                onChange={(e) => setTicketType(e.target.value)}
                className={ui.select}
              >
                <option value="warning">⚠️ Warning</option>
                <option value="performance_review">📋 Performance Review</option>
                <option value="policy_violation">🚨 Policy Violation</option>
                <option value="escalation">📈 Escalation</option>
                <option value="note">📝 Note</option>
              </select>
            </div>
            <div>
              <label className={`text-sm ${ui.muted} mb-1 block`}>Message</label>
              <textarea
                value={ticketMessage}
                onChange={(e) => setTicketMessage(e.target.value)}
                className={`${ui.input} min-h-[100px]`}
                placeholder="Describe the issue or observation…"
              />
            </div>
            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
                {error}
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => { setTicketOpen(false); setTicketMessage(""); setError(""); }} className={`${ui.btnGhost} flex-1`}>
                Cancel
              </button>
              <button
                onClick={handleSendTicket}
                disabled={ticketLoading || !ticketMessage.trim()}
                className={`${ui.btnPrimary} flex-1`}
              >
                {ticketLoading ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
