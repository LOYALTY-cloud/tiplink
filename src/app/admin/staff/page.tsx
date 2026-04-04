"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ui } from "@/lib/ui";
import { getAdminHeaders, getAdminSession } from "@/lib/auth/adminSession";

type AdminEntry = {
  id: string;
  user_id: string;
  full_name: string | null;
  role: string;
  status: string;
  restricted_until: string | null;
  created_at: string;
  last_login_at: string | null;
  action_count: number;
  admin_id_display: string | null;
  availability: string;
  last_active_at: string | null;
  last_action: { action: string; created_at: string; target_user: string | null } | null;
  risk_score: number;
  risk_level: string;
};

const STATUS_COLORS: Record<string, string> = {
  active: "text-green-400",
  restricted: "text-yellow-400",
  suspended: "text-red-400",
  terminated: "text-white/30",
};

const STATUS_DOT: Record<string, string> = {
  active: "bg-green-400",
  restricted: "bg-yellow-400",
  suspended: "bg-red-400",
  terminated: "bg-white/30",
};

const RISK_COLORS: Record<string, string> = {
  low: "text-green-400",
  medium: "text-yellow-400",
  high: "text-orange-400",
  critical: "text-red-400",
};

const RISK_BG: Record<string, string> = {
  low: "bg-green-500/10 border-green-500/20",
  medium: "bg-yellow-500/10 border-yellow-500/20",
  high: "bg-orange-500/10 border-orange-500/20",
  critical: "bg-red-500/10 border-red-500/20",
};

export default function AdminStaffPage() {
  const router = useRouter();
  const [admins, setAdmins] = useState<AdminEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionTarget, setActionTarget] = useState<AdminEntry | null>(null);
  const [actionType, setActionType] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [actionDuration, setActionDuration] = useState("24h");
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const session = getAdminSession();
  const isOwner = session?.role === "owner";

  useEffect(() => {
    loadAdmins();
  }, []);

  async function loadAdmins() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/staff", { headers: getAdminHeaders() });
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setAdmins(data.admins ?? []);
    } catch {
      setError("Failed to load staff");
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange() {
    if (!actionTarget || !actionType || !actionReason.trim()) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/manage/status", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify({
          adminId: actionTarget.id,
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
      setActionTarget(null);
      setActionType("");
      setActionReason("");
      loadAdmins();
    } catch {
      setError("Failed to update status");
    } finally {
      setActionLoading(false);
    }
  }

  function formatTime(iso: string | null) {
    if (!iso) return "Never";
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    if (diffMs < 60_000) return "Just now";
    if (diffMs < 3600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
    if (diffMs < 86400_000) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return d.toLocaleDateString();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className={ui.muted}>Loading staff…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className={ui.h1}>Staff</h1>
        <span className={`${ui.chip}`}>{admins.length} admin{admins.length !== 1 ? "s" : ""}</span>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
          {error}
          <button onClick={() => setError("")} className="ml-2 text-red-400 hover:text-red-300">✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {admins.map((admin) => (
          <div key={admin.id} className={`${ui.card} p-5 space-y-3`}>
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  {admin.admin_id_display && (
                    <span className="text-xs font-mono bg-white/10 px-2 py-0.5 rounded">
                      {admin.admin_id_display}
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-semibold mt-1">
                  {admin.full_name || "Unnamed Admin"}
                </h3>
                <p className={`text-sm ${ui.muted2} capitalize`}>{admin.role}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${STATUS_DOT[admin.status] ?? "bg-white/30"}`} />
                <span className={`text-xs font-medium capitalize ${STATUS_COLORS[admin.status] ?? ui.muted2}`}>
                  {admin.status}
                </span>
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 text-xs">
              <span className={ui.muted2}>
                Last login: {formatTime(admin.last_login_at)}
              </span>
              <span className={ui.muted2}>
                Actions: {admin.action_count}
              </span>
            </div>

            {/* Last Action */}
            {admin.last_action && (
              <div className={`text-xs ${ui.muted2} bg-white/5 rounded-lg px-3 py-1.5`}>
                <span className="text-white/60">Last action:</span>{" "}
                <span className="text-white/80">{admin.last_action.action.replace(/_/g, " ")}</span>{" "}
                <span className="text-white/40">{formatTime(admin.last_action.created_at)}</span>
              </div>
            )}

            {/* Risk Score + Availability */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${
                  admin.availability === "online" ? "bg-green-400" :
                  admin.availability === "busy" ? "bg-yellow-400" : "bg-white/20"
                }`} />
                <span className={`text-xs ${ui.muted2} capitalize`}>{admin.availability}</span>
              </div>
              {admin.role !== "owner" && (
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${RISK_BG[admin.risk_level] ?? RISK_BG.low} ${RISK_COLORS[admin.risk_level] ?? RISK_COLORS.low}`}>
                  Risk: {admin.risk_score}
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => router.push(`/admin/staff/${admin.id}`)}
                className={`${ui.btnGhost} ${ui.btnSmall} text-xs`}
              >
                View Profile
              </button>
              {isOwner && admin.role !== "owner" && (
                <>
                  {admin.status === "active" && (
                    <>
                      <button
                        onClick={() => { setActionTarget(admin); setActionType("restricted"); }}
                        className={`${ui.btnGhost} ${ui.btnSmall} text-xs text-yellow-400 hover:text-yellow-300`}
                      >
                        Restrict
                      </button>
                      <button
                        onClick={() => { setActionTarget(admin); setActionType("suspended"); }}
                        className={`${ui.btnGhost} ${ui.btnSmall} text-xs text-red-400 hover:text-red-300`}
                      >
                        Suspend
                      </button>
                    </>
                  )}
                  {(admin.status === "restricted" || admin.status === "suspended") && (
                    <button
                      onClick={() => { setActionTarget(admin); setActionType("active"); }}
                      className={`${ui.btnGhost} ${ui.btnSmall} text-xs text-green-400 hover:text-green-300`}
                    >
                      Reactivate
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {admins.length === 0 && (
        <div className={`${ui.card} p-12 text-center`}>
          <p className={ui.muted}>No admin staff found.</p>
          <p className={`text-sm ${ui.muted2} mt-1`}>
            Create admins from /admin/users/create, then sync them to the admins table by running the migration.
          </p>
        </div>
      )}

      {/* Status change modal — double confirm for destructive actions */}
      {actionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className={`${ui.card} p-6 max-w-md w-full mx-4 space-y-4`}>
            <h2 className={ui.h2}>
              {actionType === "active" ? "Reactivate" :
               actionType === "restricted" ? "Restrict" :
               actionType === "suspended" ? "Suspend" :
               actionType === "terminated" ? "Terminate" : "Update"}{" "}
              {actionTarget.full_name}
            </h2>

            <p className={`text-sm ${ui.muted}`}>
              {actionType === "restricted" && "This admin will be in view-only mode until the restriction expires."}
              {actionType === "suspended" && "This admin will be blocked from logging in."}
              {actionType === "terminated" && "This admin's access will be permanently revoked. This cannot be easily undone."}
              {actionType === "active" && "This admin will regain full access."}
            </p>

            {actionType === "restricted" && (
              <div>
                <label className={`text-sm ${ui.muted} mb-1 block`}>Duration</label>
                <select
                  value={actionDuration}
                  onChange={(e) => setActionDuration(e.target.value)}
                  className={ui.select}
                >
                  <option value="1h">1 Hour</option>
                  <option value="24h">24 Hours</option>
                  <option value="7d">7 Days</option>
                </select>
              </div>
            )}

            <div>
              <label className={`text-sm ${ui.muted} mb-1 block`}>Reason (required)</label>
              <textarea
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                className={`${ui.input} min-h-[80px]`}
                placeholder="Provide a reason for this action…"
              />
            </div>

            {/* Type-to-confirm for destructive actions */}
            {(actionType === "suspended" || actionType === "terminated") && (
              <div>
                <label className={`text-sm text-red-400 mb-1 block`}>
                  Type <span className="font-mono font-bold">{actionType === "suspended" ? "SUSPEND" : "TERMINATE"}</span> to confirm
                </label>
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className={`${ui.input} border-red-500/30 focus:border-red-500/50`}
                  placeholder={actionType === "suspended" ? "SUSPEND" : "TERMINATE"}
                />
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => { setActionTarget(null); setActionType(""); setActionReason(""); setConfirmText(""); }}
                className={`${ui.btnGhost} flex-1`}
              >
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
                className={`${ui.btnPrimary} flex-1 ${
                  actionType === "suspended" || actionType === "terminated"
                    ? "!from-red-500 !to-red-700 !shadow-red-500/35"
                    : actionType === "restricted"
                    ? "!from-yellow-500 !to-yellow-700 !shadow-yellow-500/35"
                    : ""
                }`}
              >
                {actionLoading ? "Processing…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
