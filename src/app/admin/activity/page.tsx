"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseAdmin as supabase } from "@/lib/supabase/adminBrowserClient";
import { getAdminHeaders, getAdminSession } from "@/lib/auth/adminSession";
import { useRouter } from "next/navigation";
import { useConnectionState } from "@/lib/useConnectionState";
import { ui } from "@/lib/ui";
import ActivityDetailPanel from "@/components/admin/ActivityDetailPanel";

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
  metadata: Record<string, unknown>;
  source?: "api" | "realtime";
};

const severityStyles: Record<string, string> = {
  critical: "border-red-500/30 bg-red-500/5",
  high: "border-amber-500/20 bg-amber-500/5",
  medium: "border-white/10 bg-white/[.02]",
  low: "border-white/5 bg-transparent",
};

const actionIcons: Record<string, string> = {
  set_role: "🔑",
  restrict: "🚫",
  suspend: "⏸️",
  close: "🔒",
  refund: "💸",
  update_status: "📝",
  bulk_restrict: "⚡",
  support_note: "💬",
  auto_flag: "🤖",
  admin_override: "⚙️",
  auto_restrict: "🤖",
  risk_eval: "🚩",
  risk_flag: "🚩",
  tip_received: "💰",
  tip_credit: "💰",
  tip_refunded: "💸",
  payout: "🏦",
  dispute: "⚠️",
  ticket_created: "🎫",
  ticket_updated: "📝",
  ticket_resolved: "✅",
  ticket_closed: "🔒",
  ticket_breached: "🚨",
  ticket_reassigned: "🔁",
  ticket_chat_started: "💬",
};

export default function ActivityFeedPage() {
  const router = useRouter();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [selectedActivity, setSelectedActivity] = useState<FeedItem | null>(null);
  const { pulseClass, label: connectionLabel } = useConnectionState("activity-probe");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const session = getAdminSession();
      if (!session) { router.replace("/admin/login"); return; }

      const allowed = ["owner", "super_admin"];
      if (!allowed.includes(session.role)) {
        router.replace("/dashboard");
        return;
      }

      await fetchFeed();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function fetchFeed() {
    const headers = getAdminHeaders();
    if (!headers["X-Admin-Id"]) return;

    const res = await fetch("/api/admin/activity-feed?limit=100", {
      headers,
    });
    if (!res.ok) { setLoading(false); return; }
    const json = await res.json();
    setItems((json.data ?? []).map((d: FeedItem) => ({ ...d, source: "api" as const })));
    setLoading(false);
  }

  // Helper: resolve user display info from profile
  const resolveUser = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("display_name, handle")
        .eq("id", userId)
        .maybeSingle();
      return { display_name: data?.display_name ?? null, handle: data?.handle ?? null };
    } catch {
      return { display_name: null, handle: null };
    }
  }, []);

  // Realtime: stream new admin_actions and ledger entries
  const handleNewAction = useCallback(async (payload: { new: Record<string, unknown> }) => {
    const row = payload.new;
    let targetHandle: string | null = null;
    let targetName: string | null = null;
    if (row.target_user) {
      const u = await resolveUser(String(row.target_user));
      targetHandle = u.handle;
      targetName = u.display_name;
    }
    const item: FeedItem = {
      id: String(row.id),
      action: String(row.action ?? ""),
      label: String(row.action ?? "Admin action"),
      severity: String(row.severity ?? "low"),
      target_user: row.target_user ? String(row.target_user) : null,
      target_handle: targetHandle,
      target_display_name: targetName,
      created_at: String(row.created_at ?? new Date().toISOString()),
      actor: "Admin",
      role: "super_admin",
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      source: "realtime",
    };
    setItems((prev) => [item, ...prev].slice(0, 200));
  }, [resolveUser]);

  const handleNewTx = useCallback(async (payload: { new: Record<string, unknown> }) => {
    const tx = payload.new;
    const txType = String(tx.type ?? "");
    if (!["tip_received", "tip_credit", "payout", "dispute", "tip_refunded"].includes(txType)) return;

    const amount = Number(tx.amount ?? 0);
    let targetHandle: string | null = null;
    let targetName: string | null = null;
    if (tx.user_id) {
      const u = await resolveUser(String(tx.user_id));
      targetHandle = u.handle;
      targetName = u.display_name;
    }
    const action = txType === "tip_credit" ? "tip_received" : txType;
    const item: FeedItem = {
      id: String(tx.id ?? Date.now()),
      action,
      label: `${action.replace(/_/g, " ")} — $${Math.abs(amount).toFixed(2)}`,
      severity: txType === "dispute" ? "high" : "low",
      target_user: tx.user_id ? String(tx.user_id) : null,
      target_handle: targetHandle,
      target_display_name: targetName,
      created_at: String(tx.created_at ?? new Date().toISOString()),
      actor: "System",
      role: "system",
      metadata: { amount, type: txType, reference_id: tx.reference_id ?? null, tip_id: tx.reference_id ?? null },
      source: "realtime",
    };
    setItems((prev) => [item, ...prev].slice(0, 200));
  }, [resolveUser]);

  const handleTicketChange = useCallback(async (payload: { new: Record<string, unknown>; old: Record<string, unknown>; eventType: string }) => {
    const ticket = payload.new;
    const old = payload.old ?? {};
    const subject = String(ticket.subject ?? "Ticket");
    const shortId = String(ticket.id ?? "").slice(0, 8);

    let action = "ticket_updated";
    let label = `Ticket updated: ${subject}`;
    let severity = "low";

    if (payload.eventType === "INSERT") {
      action = "ticket_created";
      label = `New ticket: ${subject}`;
      severity = Number(ticket.priority ?? 0) >= 2 ? "high" : "medium";
    } else if (ticket.status !== old.status) {
      if (ticket.status === "resolved") {
        action = "ticket_resolved";
        label = `Ticket resolved: ${subject}`;
        severity = "low";
      } else if (ticket.status === "closed") {
        action = "ticket_closed";
        label = `Ticket closed: ${subject}`;
        severity = "low";
      }
    }

    if (ticket.breach_notified && !old.breach_notified) {
      action = "ticket_breached";
      label = `SLA breached: ${subject}`;
      severity = "critical";
    }

    if (ticket.assigned_admin_id !== old.assigned_admin_id && old.assigned_admin_id) {
      action = "ticket_reassigned";
      label = `Ticket reassigned: ${subject}`;
      severity = "high";
    }

    let targetHandle: string | null = null;
    let targetName: string | null = null;
    if (ticket.user_id) {
      const u = await resolveUser(String(ticket.user_id));
      targetHandle = u.handle;
      targetName = u.display_name;
    }

    const item: FeedItem = {
      id: `ticket-${shortId}-${Date.now()}`,
      action,
      label,
      severity,
      target_user: ticket.user_id ? String(ticket.user_id) : null,
      target_handle: targetHandle,
      target_display_name: targetName,
      created_at: String(ticket.updated_at ?? new Date().toISOString()),
      actor: "System",
      role: "system",
      metadata: { ticket_id: String(ticket.id ?? ""), subject, status: String(ticket.status ?? ""), priority: Number(ticket.priority ?? 0) },
      source: "realtime",
    };
    setItems((prev) => [item, ...prev].slice(0, 200));
  }, [resolveUser]);

  useEffect(() => {
    // Poll for new activity every 8 seconds (realtime blocked by RLS on admin_actions + transactions_ledger)
    const interval = setInterval(fetchFeed, 8_000);
    return () => clearInterval(interval);
  }, []);

  const timeAgo = (iso: string) => {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };

  const filters = ["all", "admin", "tickets", "tips", "refunds", "disputes"];
  const filtered = items.filter((it) => {
    if (filter === "all") return true;
    if (filter === "admin") return !["tip_received", "payout", "dispute", "tip_refunded"].includes(it.action) && !it.action.startsWith("ticket_");
    if (filter === "tickets") return it.action.startsWith("ticket_");
    if (filter === "tips") return it.action === "tip_received" || it.action === "tip_credit";
    if (filter === "refunds") return it.action === "refund" || it.action === "tip_refunded";
    if (filter === "disputes") return it.action === "dispute";
    return true;
  });

  if (loading) return <p className="text-white/60 p-6">Loading…</p>;

  return (
    <div className="p-4 md:p-6 pb-24 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg md:text-xl font-semibold text-white">Live Activity</h1>
        <span className="text-xs text-white/30 flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${pulseClass}`} />
          {connectionLabel}
        </span>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory pb-1">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); navigator.vibrate?.(10); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition snap-start flex-shrink-0 ${
              filter === f
                ? "bg-blue-500/20 text-blue-300 border border-blue-400/30"
                : "bg-white/5 text-white/50 border border-white/10 hover:bg-white/10"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Feed */}
      <div className="space-y-1">
        {filtered.length === 0 ? (
          <p className="text-sm text-white/40 py-8 text-center">No activity yet</p>
        ) : (
          filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedActivity(item)}
              className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition hover:bg-white/5 ${
                severityStyles[item.severity] ?? severityStyles.low
              } ${item.source === "realtime" ? "animate-[fadeIn_0.3s_ease-out]" : ""}`}
            >
              <span className="text-lg mt-0.5">{actionIcons[item.action] ?? "📋"}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-white truncate">{item.label}</span>
                  <span className="text-[10px] text-white/25 flex-shrink-0">{timeAgo(item.created_at)}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-white/40">{item.actor}</span>
                  {item.role && item.role !== "system" && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-white/30 uppercase tracking-wider">
                      {item.role}
                    </span>
                  )}
                  {item.target_handle && (
                    <span className="text-[10px] text-white/30">→ @{item.target_handle}</span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {selectedActivity && (
        <ActivityDetailPanel
          data={selectedActivity}
          onClose={() => setSelectedActivity(null)}
        />
      )}
    </div>
  );
}
