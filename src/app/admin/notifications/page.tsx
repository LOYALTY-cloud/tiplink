"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getAdminHeaders, getAdminSession } from "@/lib/auth/adminSession";
import { ui } from "@/lib/ui";

type AdminNotif = {
  id: string;
  title: string | null;
  message: string | null;
  link: string | null;
  type: string;
  priority: "low" | "medium" | "high" | "critical";
  visibility: "private" | "role" | "global";
  role_target?: string[] | null;
  admin_target?: string | null;
  admin_id?: string | null;
  read: boolean;
  status: "open" | "in_progress" | "resolved" | "dismissed";
  requires_action: boolean;
  resolved_at?: string | null;
  archived?: boolean;
  metadata?: Record<string, any> | null;
  created_at: string;
};

type FilterKey = "all" | "action" | "finance" | "support" | "system";
type KpiFilterKey = "all" | "open" | "critical" | "action" | "mine";
type StatusFilterKey = "all" | "open" | "in_progress" | "resolved";

type NotificationKpi = {
  open: number;
  critical: number;
  action: number;
  mine: number;
};

const TYPE_LINK_FALLBACK: Record<string, string> = {
  disciplinary_report: "/admin/staff/tickets",
  finance_alert: "/admin/transactions",
  support_alert: "/admin/tickets",
  fraud_alert: "/admin/fraud",
  payout_alert: "/admin/transactions",
  security_alert: "/admin/security",
  ai_alert: "/admin/owner-ai",
  marketplace_alert: "/admin/marketplace",
  store_alert: "/admin/stores",
  dmca_alert: "/admin/dmca",
};

function normalizeNotification(raw: Partial<AdminNotif> & { id: string }): AdminNotif {
  return {
    id: raw.id,
    title: raw.title ?? "Admin Notification",
    message: raw.message ?? "",
    link: raw.link && raw.link.trim() ? raw.link : TYPE_LINK_FALLBACK[raw.type ?? ""] ?? null,
    type: raw.type ?? "admin_alert",
    priority: raw.priority ?? "medium",
    visibility: raw.visibility ?? "private",
    role_target: raw.role_target ?? null,
    admin_target: raw.admin_target ?? null,
    admin_id: raw.admin_id ?? null,
    read: raw.read ?? false,
    status: raw.status ?? "open",
    requires_action: raw.requires_action ?? false,
    resolved_at: raw.resolved_at ?? null,
    archived: raw.archived ?? false,
    metadata: raw.metadata ?? null,
    created_at: raw.created_at ?? new Date().toISOString(),
  };
}

function isVisibleToAdmin(raw: Partial<AdminNotif>, role: string | null, adminId: string | null) {
  if (!role || !adminId) return false;
  if (role === "owner" || role === "super_admin") return true;

  const visibility = raw.visibility ?? "private";
  if (visibility === "private") {
    const target = raw.admin_target ?? raw.admin_id ?? null;
    return target === adminId;
  }
  if (visibility === "role") {
    return (raw.role_target ?? []).includes(role);
  }
  return visibility === "global";
}

function isActive(raw: Partial<AdminNotif>) {
  const archived = raw.archived ?? false;
  const status = raw.status ?? "open";
  return !archived && (status === "open" || status === "in_progress");
}

function notificationBucket(type: string): FilterKey {
  if (type.includes("finance") || type.includes("payout") || type.includes("withdrawal") || type === "ai_alert") return "finance";
  if (type.includes("support") || type.includes("ticket")) return "support";
  return "system";
}

const TABS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "action", label: "Action Required" },
  { key: "finance", label: "Finance" },
  { key: "support", label: "Support" },
  { key: "system", label: "System" },
];

export default function AdminNotificationsPage() {
  const router = useRouter();
  const session = getAdminSession();
  const role = session?.role ?? null;
  const adminId = session?.admin_id ?? null;
  const [items, setItems] = useState<AdminNotif[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [kpiFilter, setKpiFilter] = useState<KpiFilterKey>("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [kpi, setKpi] = useState<NotificationKpi>({ open: 0, critical: 0, action: 0, mine: 0 });

  // includeHistory=1 fetches resolved/dismissed (archived) items so the
  // "Resolved" status filter chip actually returns results.
  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/notifications?includeRead=1&includeHistory=1", {
        headers: getAdminHeaders(),
      });
      if (!res.ok) return;
      const json = await res.json();
      const notifications = ((json.notifications ?? []) as (Partial<AdminNotif> & { id: string })[])
        .map((row) => normalizeNotification(row));
      setItems(notifications);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadKpi = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/notifications/kpi", {
        headers: getAdminHeaders(),
      });
      if (!res.ok) return;
      const json = await res.json();
      setKpi({
        open: Number(json.open ?? 0),
        critical: Number(json.critical ?? 0),
        action: Number(json.action ?? 0),
        mine: Number(json.mine ?? 0),
      });
    } catch {
      // Keep locally derived KPI state if request fails.
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
    void loadKpi();
    // Polling fallback — realtime is blocked by RLS on anon key.
    const interval = setInterval(() => { void loadNotifications(); }, 30_000);
    return () => clearInterval(interval);
  }, [loadNotifications, loadKpi]);

  useEffect(() => {
    setKpi({
      open: items.filter((item) => item.status === "open").length,
      critical: items.filter((item) => item.priority === "critical").length,
      action: items.filter((item) => item.requires_action).length,
      mine: items.filter((item) => {
        const target = item.admin_target ?? item.admin_id ?? null;
        return target === adminId && item.status !== "resolved" && item.status !== "dismissed";
      }).length,
    });
  }, [adminId, items]);

  useEffect(() => {
    if (!role || !adminId) return;

    const channel = supabase
      .channel(`admin-notification-center-${adminId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_notifications" },
        (payload) => {
          const incoming = payload.new as Partial<AdminNotif> & { id?: string };
          if (!incoming?.id) return;
          if (!isVisibleToAdmin(incoming, role, adminId)) return;
          if (!isActive(incoming)) return;

          const normalized = normalizeNotification(incoming as Partial<AdminNotif> & { id: string });
          setItems((prev) => [normalized, ...prev.filter((item) => item.id !== normalized.id)]);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "admin_notifications" },
        (payload) => {
          const incoming = payload.new as Partial<AdminNotif> & { id?: string };
          if (!incoming?.id) return;
          if (!isVisibleToAdmin(incoming, role, adminId)) return;

          if (!isActive(incoming)) {
            setItems((prev) => prev.filter((item) => item.id !== incoming.id));
            return;
          }

          const normalized = normalizeNotification(incoming as Partial<AdminNotif> & { id: string });
          setItems((prev) => prev.map((item) => item.id === normalized.id ? normalized : item));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [adminId, role]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const tabMatch =
        filter === "all" ||
        (filter === "action" && item.requires_action) ||
        notificationBucket(item.type) === filter;

      let kpiMatch = true;
      if (kpiFilter === "open") {
        kpiMatch = item.status === "open";
      } else if (kpiFilter === "critical") {
        kpiMatch = item.priority === "critical";
      } else if (kpiFilter === "action") {
        kpiMatch = item.requires_action;
      } else if (kpiFilter === "mine") {
        const target = item.admin_target ?? item.admin_id ?? null;
        kpiMatch = target === adminId && item.status !== "resolved" && item.status !== "dismissed";
      }

      const statusMatch = statusFilter === "all" || item.status === statusFilter;

      const q = search.trim().toLowerCase();
      const searchMatch =
        !q ||
        (item.title ?? "").toLowerCase().includes(q) ||
        (item.message ?? "").toLowerCase().includes(q);

      return tabMatch && kpiMatch && statusMatch && searchMatch;
    });
  }, [adminId, filter, items, kpiFilter, search, statusFilter]);

  const counts = useMemo(() => ({
    all: items.length,
    action: items.filter((item) => item.requires_action).length,
    finance: items.filter((item) => notificationBucket(item.type) === "finance").length,
    support: items.filter((item) => notificationBucket(item.type) === "support").length,
    system: items.filter((item) => notificationBucket(item.type) === "system").length,
  }), [items]);

  async function markRead(id: string) {
    const res = await fetch("/api/admin/notifications/read", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAdminHeaders(),
      },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) return false;
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, read: true } : item));
    return true;
  }

  async function updateStatus(id: string, status: AdminNotif["status"]) {
    setBusyId(id);
    try {
      const res = await fetch("/api/admin/notifications/status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAdminHeaders(),
        },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) return;

      if (status === "resolved" || status === "dismissed") {
        setItems((prev) => prev.filter((item) => item.id !== id));
        return;
      }

      const nowIso = new Date().toISOString();
      setItems((prev) => prev.map((item) => item.id === id ? {
        ...item,
        status,
        resolved_at: status === "in_progress" ? item.resolved_at ?? null : nowIso,
      } : item));
    } finally {
      setBusyId(null);
    }
  }

  async function handleView(item: AdminNotif) {
    if (!item.read) {
      await markRead(item.id);
    }
    if (item.link) {
      router.push(item.link);
    }
  }

  async function handleAction(action: string, notif: AdminNotif) {
    if (action === "view_transactions") {
      router.push("/admin/transactions");
    } else if (action === "view_withdrawals") {
      router.push("/admin/transactions?type=withdrawal");
    } else if (action === "view_financials") {
      router.push("/admin/revenue");
    } else if (action === "view_logs") {
      router.push("/admin/logs");
    } else if (action === "retry_failed") {
      const confirmed = confirm("Retry all failed transactions?");
      if (!confirmed) return;

      try {
        const res = await fetch("/api/admin/actions/retry-failed", {
          method: "POST",
          headers: getAdminHeaders(),
        });
        if (res.ok) {
          alert("✓ Retry triggered successfully");
          await updateStatus(notif.id, "in_progress");
        } else {
          alert("✗ Failed to trigger retry");
        }
      } catch (error) {
        alert("✗ Error triggering retry");
      }
    }
  }

  function priorityClass(priority: AdminNotif["priority"]) {
    if (priority === "critical") return "text-red-300 border-red-500/30 bg-red-500/10";
    if (priority === "high") return "text-yellow-300 border-yellow-500/30 bg-yellow-500/10";
    if (priority === "medium") return "text-blue-300 border-blue-500/30 bg-blue-500/10";
    return "text-white/80 border-white/15 bg-white/[0.04]";
  }

  function cardShell(priority: AdminNotif["priority"]) {
    if (priority === "critical") return "border-red-500/25 bg-gradient-to-br from-red-500/[0.08] to-white/[0.03]";
    if (priority === "high") return "border-yellow-500/25 bg-gradient-to-br from-yellow-500/[0.08] to-white/[0.03]";
    if (priority === "medium") return "border-blue-500/25 bg-gradient-to-br from-blue-500/[0.08] to-white/[0.03]";
    return "border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.02]";
  }

  function statusClass(status: AdminNotif["status"]) {
    if (status === "open") return "text-yellow-300";
    if (status === "in_progress") return "text-blue-300";
    if (status === "resolved") return "text-green-300";
    return "text-white/40";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className={ui.h1}>Notifications</h1>
          <p className={`text-sm ${ui.muted2} mt-1`}>
            Monitor live system activity and take action without clutter.
          </p>
        </div>
        <Link href="/admin/notifications/history" className={`${ui.btnGhost} ${ui.btnSmall} text-xs`}>
          View History
        </Link>
      </div>

      <div className={`${ui.card} p-4 flex flex-wrap items-center gap-2`}>
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`${ui.btnSmall} rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              filter === key
                ? "bg-white/10 text-white border border-white/20 shadow-[0_10px_24px_rgba(255,255,255,0.06)]"
                : "text-white/50 hover:text-white hover:bg-white/5 border border-transparent"
            }`}
          >
            {label} <span className="text-white/40 ml-1">{counts[key]}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Open", key: "open", value: kpi.open, valueClass: "text-white" },
          { label: "Critical", key: "critical", value: kpi.critical, valueClass: "text-red-300" },
          { label: "Action Required", key: "action", value: kpi.action, valueClass: "text-yellow-300" },
          { label: "Assigned To You", key: "mine", value: kpi.mine, valueClass: "text-blue-300" },
        ].map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => {
              setKpiFilter(card.key as KpiFilterKey);
              if (card.key === "action") setFilter("action");
            }}
            className={`text-left ${ui.card} p-4 transition hover:bg-white/[0.06] ${
              kpiFilter === card.key ? "border-blue-400/40 bg-white/[0.06]" : "border-white/10"
            }`}
          >
            <p className="text-[11px] uppercase tracking-wider text-white/35">{card.label}</p>
            <p className={`text-xl md:text-2xl font-semibold mt-1 transition-all duration-300 ${card.valueClass}`}>
              {card.value}
            </p>
          </button>
        ))}
      </div>

      {kpiFilter !== "all" && (
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => setKpiFilter("all")}
            className="text-xs text-blue-400 hover:text-blue-300 transition"
          >
            Reset Filter
          </button>
        </div>
      )}

      <div className={`${ui.card} p-4 space-y-3`}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <input
            type="text"
            placeholder="Search notifications..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full md:w-[300px] bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-blue-400/50"
          />

          <div className="flex gap-2 flex-wrap">
            {(["all", "open", "in_progress", "resolved"] as StatusFilterKey[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 text-xs rounded-full border transition ${
                  statusFilter === s
                    ? "bg-white/10 border-white/20 text-white"
                    : "border-white/10 text-white/50 hover:text-white"
                }`}
              >
                {s.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs text-white/30">
          Filters: {kpiFilter} • {statusFilter} • {search ? `"${search}"` : "(no search)"}
        </p>
      </div>

      {loading ? (
        <div className={`${ui.card} p-10 text-center`}>
          <p className={ui.muted}>Loading notifications...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className={`${ui.card} p-10 text-center`}>
          <p className={ui.muted}>No active notifications.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item, index) => (
            <div
              key={item.id}
              style={{ animation: `fadeUp 0.3s ease ${index * 45}ms both` }}
              className={`group rounded-2xl border p-5 transition hover:scale-[1.01] hover:shadow-[0_16px_44px_rgba(0,0,0,0.35)] ${cardShell(item.priority)}`}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${priorityClass(item.priority)}`}>
                    {item.priority}
                  </span>
                  <span className={`text-[11px] uppercase tracking-wide ${statusClass(item.status)}`}>
                    Status: {item.status === "in_progress" ? "In Progress" : item.status}
                  </span>
                  {item.requires_action && (
                    <span className="text-[10px] uppercase tracking-wide text-yellow-300/80">
                      action required
                    </span>
                  )}
                  {!item.read && (
                    <span className="text-[10px] uppercase tracking-wide text-blue-300">
                      unread
                    </span>
                  )}
                  <span className="text-[10px] uppercase tracking-wide text-white/30">
                    {item.visibility}
                  </span>
                </div>

                <div>
                  <p className="text-sm text-white font-medium tracking-tight">
                    {item.title || "Admin Notification"}
                  </p>
                  <p className="text-xs text-white/45 mt-1 whitespace-pre-wrap leading-5 max-w-3xl">
                    {item.message || "No message"}
                  </p>

                  {item.metadata?.cause && (
                    <p className="text-xs text-yellow-300/80 mt-2 bg-yellow-500/5 px-2 py-1 rounded border border-yellow-500/10">
                      💡 Cause: {item.metadata.cause}
                    </p>
                  )}

                  {item.metadata?.actions && Array.isArray(item.metadata.actions) && item.metadata.actions.length > 0 && (
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {item.metadata.actions.map((action: any, idx: number) => (
                        <button
                          key={idx}
                          onClick={() => handleAction(action.action, item)}
                          className="text-xs px-3 py-1.5 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 border border-blue-500/20 transition"
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 text-[11px] text-white/35">
                  <span>{new Date(item.created_at).toLocaleString()}</span>
                  <span>{item.type}</span>
                  {item.link ? <span>linked</span> : null}
                </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 lg:max-w-[280px] lg:justify-end">
                  <button
                    type="button"
                    onClick={() => handleView(item)}
                    className="bg-white/10 hover:bg-white/15 px-3 py-1.5 rounded text-xs font-medium transition"
                  >
                    View
                  </button>
                  {!item.read && (
                    <button
                      type="button"
                      onClick={() => markRead(item.id)}
                      className="bg-white/10 hover:bg-white/15 px-3 py-1.5 rounded text-xs font-medium transition"
                    >
                      Mark Read
                    </button>
                  )}
                  {item.status === "open" && (
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => updateStatus(item.id, "in_progress")}
                      className="bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded text-xs font-medium transition disabled:opacity-50"
                    >
                      In Progress
                    </button>
                  )}
                  {item.status !== "resolved" && item.status !== "dismissed" && (
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => updateStatus(item.id, "resolved")}
                      className="text-xs text-emerald-300 hover:text-emerald-200 transition lg:opacity-0 lg:group-hover:opacity-100"
                    >
                      Resolve →
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
