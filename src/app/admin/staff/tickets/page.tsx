"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ui } from "@/lib/ui";
import { getAdminHeaders } from "@/lib/auth/adminSession";

type Ticket = {
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
  from_admin: { id: string; full_name: string; role: string } | null;
  to_admin: { id: string; full_name: string; role: string } | null;
};

const TYPE_COLORS: Record<string, string> = {
  warning: "text-red-400 bg-red-500/10 border-red-500/20",
  performance_review: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  policy_violation: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  escalation: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  note: "text-blue-400 bg-blue-500/10 border-blue-500/20",
};

const TYPE_ICONS: Record<string, string> = {
  warning: "⚠️",
  performance_review: "📋",
  policy_violation: "🚨",
  escalation: "📈",
  note: "📝",
};

const STATUS_COLORS: Record<string, string> = {
  open: "text-yellow-400",
  acknowledged: "text-blue-400",
  resolved: "text-green-400",
};

export default function AdminStaffTicketsPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "acknowledged" | "resolved">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  useEffect(() => {
    loadTickets();
  }, [statusFilter, typeFilter]);

  async function loadTickets() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (typeFilter !== "all") params.set("type", typeFilter);
      const res = await fetch(`/api/admin/staff/tickets?${params}`, { headers: getAdminHeaders() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTickets(data.tickets ?? []);
    } catch {
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(ticketId: string, action: "acknowledge" | "resolve") {
    await fetch("/api/admin/staff/tickets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...getAdminHeaders() },
      body: JSON.stringify({ ticketId, action }),
    });
    loadTickets();
  }

  function formatTime(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    if (diffMs < 60_000) return "Just now";
    if (diffMs < 3600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return d.toLocaleDateString();
  }

  // Stats
  const openCount = tickets.filter((t) => t.status === "open").length;
  const warningCount = tickets.filter((t) => t.type === "warning").length;
  const unresolvedCount = tickets.filter((t) => t.status !== "resolved").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className={ui.h1}>Discipline Records</h1>
        <button onClick={() => router.push("/admin/staff")} className={`${ui.btnGhost} ${ui.btnSmall} text-xs`}>
          ← Staff
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className={`${ui.card} p-4 text-center`}>
          <p className="text-2xl font-bold text-yellow-400">{openCount}</p>
          <p className={`text-xs ${ui.muted2}`}>Open</p>
        </div>
        <div className={`${ui.card} p-4 text-center`}>
          <p className="text-2xl font-bold text-red-400">{warningCount}</p>
          <p className={`text-xs ${ui.muted2}`}>Warnings</p>
        </div>
        <div className={`${ui.card} p-4 text-center`}>
          <p className="text-2xl font-bold">{unresolvedCount}</p>
          <p className={`text-xs ${ui.muted2}`}>Unresolved</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex gap-1">
          <span className={`text-xs ${ui.muted2} self-center mr-1`}>Status:</span>
          {(["all", "open", "acknowledged", "resolved"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`${ui.btnSmall} rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition ${
                statusFilter === f
                  ? "bg-white/10 text-white border border-white/20"
                  : "text-white/50 hover:text-white hover:bg-white/5 border border-transparent"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <span className={`text-xs ${ui.muted2} self-center mr-1`}>Type:</span>
          {["all", "warning", "performance_review", "policy_violation", "escalation", "note"].map((f) => (
            <button
              key={f}
              onClick={() => setTypeFilter(f)}
              className={`${ui.btnSmall} rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition ${
                typeFilter === f
                  ? "bg-white/10 text-white border border-white/20"
                  : "text-white/50 hover:text-white hover:bg-white/5 border border-transparent"
              }`}
            >
              {f === "all" ? "all" : f.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className={ui.muted}>Loading records…</p>
      ) : tickets.length === 0 ? (
        <div className={`${ui.card} p-12 text-center`}>
          <p className={ui.muted}>No discipline records found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <div key={t.id} className={`${ui.card} p-5 space-y-3`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{TYPE_ICONS[t.type] ?? "📄"}</span>
                  <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded border ${TYPE_COLORS[t.type] ?? "text-white/50"}`}>
                    {t.type.replace("_", " ")}
                  </span>
                  {t.auto_generated && (
                    <span className="text-[10px] font-mono bg-white/10 px-1.5 py-0.5 rounded text-white/40">AUTO</span>
                  )}
                  <span className={`text-xs font-medium capitalize ${STATUS_COLORS[t.status] ?? ui.muted2}`}>
                    {t.status}
                  </span>
                </div>
                <span className={`text-xs ${ui.muted2}`}>{formatTime(t.created_at)}</span>
              </div>

              <div className="flex items-center gap-4 text-xs">
                <span className={ui.muted2}>
                  From: <strong className="text-white/70">{t.from_admin?.full_name ?? "System"}</strong>
                  <span className="capitalize ml-1">({t.from_role})</span>
                </span>
                <span className={ui.muted2}>→</span>
                <span className={ui.muted2}>
                  To: <strong className="text-white/70">{t.to_admin?.full_name ?? "Unknown"}</strong>
                  <span className="capitalize ml-1">({t.to_role})</span>
                </span>
              </div>

              <p className="text-sm leading-relaxed">{t.message}</p>

              {t.acknowledged_at && (
                <p className="text-xs text-blue-400/70">✓ Acknowledged {formatTime(t.acknowledged_at)}</p>
              )}
              {t.resolved_at && (
                <p className="text-xs text-green-400/70">✓ Resolved {formatTime(t.resolved_at)}</p>
              )}

              <div className="flex gap-2 pt-1">
                {t.to_admin?.id && (
                  <button
                    onClick={() => router.push(`/admin/staff/${t.to_admin!.id}`)}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    View Profile
                  </button>
                )}
                {t.status === "open" && (
                  <button
                    onClick={() => handleAction(t.id, "acknowledge")}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    Acknowledge
                  </button>
                )}
                {(t.status === "open" || t.status === "acknowledged") && (
                  <button
                    onClick={() => handleAction(t.id, "resolve")}
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
  );
}
