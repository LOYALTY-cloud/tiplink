"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ui } from "@/lib/ui";
import { getAdminHeaders, getAdminSession } from "@/lib/auth/adminSession";

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
  const [risk, setRisk] = useState<RiskData | null>(null);
  const [lastAction, setLastAction] = useState<{ action: string; created_at: string; target_user: string | null } | null>(null);
  const [actions, setActions] = useState<ActionEntry[]>([]);
  const [tickets, setTickets] = useState<TicketEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Action modal state
  const [actionType, setActionType] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [actionDuration, setActionDuration] = useState("24h");
  const [actionLoading, setActionLoading] = useState(false);

  // Ticket modal state
  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticketType, setTicketType] = useState("note");
  const [ticketMessage, setTicketMessage] = useState("");
  const [ticketLoading, setTicketLoading] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const session = getAdminSession();
  const isOwner = session?.role === "owner";
  const isSuperAdmin = session?.role === "super_admin";

  useEffect(() => {
    loadAdmin();
  }, [id]);

  async function loadAdmin() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/staff/${id}`, { headers: getAdminHeaders() });
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setAdmin(data.admin);
      setStats(data.stats);
      setPerformance(data.performance ?? null);
      setRisk(data.risk ?? null);
      setLastAction(data.last_action ?? null);
      setActions(data.actions ?? []);
      setTickets(data.tickets ?? []);
    } catch {
      setError("Failed to load admin profile");
    } finally {
      setLoading(false);
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
      await fetch("/api/admin/staff/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify({ ticketId, action: "resolve" }),
      });
      loadAdmin();
    } catch {}
  }

  async function handleAcknowledgeTicket(ticketId: string) {
    try {
      await fetch("/api/admin/staff/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify({ ticketId, action: "acknowledge" }),
      });
      loadAdmin();
    } catch {}
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
    return (
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
            <p className={`text-xs ${ui.muted2} mt-1`}>
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

      {/* Last Action */}
      {lastAction && (
        <div className={`${ui.card} p-4`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-xs ${ui.muted2} uppercase tracking-wider mb-1`}>Last Action Taken</p>
              <p className="text-sm font-medium">{lastAction.action.replace(/_/g, " ")}</p>
              {lastAction.target_user && (
                <p className={`text-xs ${ui.muted2} mt-0.5`}>Target: {lastAction.target_user}</p>
              )}
            </div>
            <span className={`text-xs ${ui.muted2}`}>{formatTime(lastAction.created_at)}</span>
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

      {/* Risk Assessment — owner-only view, not shown for owners */}
      {risk && admin.role !== "owner" && isOwner && (
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

      {/* Control Panel — Owner only, not for other owners */}
      {isOwner && admin.role !== "owner" && (
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
            {/* Show Send Ticket button if hierarchy allows (owner→anyone, super_admin→admin) */}
            {((isOwner && admin.role !== "owner") || (isSuperAdmin && admin.role === "admin")) && (
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
            <div className="flex gap-3">
              <button onClick={() => { setTicketOpen(false); setTicketMessage(""); }} className={`${ui.btnGhost} flex-1`}>
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
