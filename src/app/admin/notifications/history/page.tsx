"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ui } from "@/lib/ui";
import { getAdminHeaders } from "@/lib/auth/adminSession";

type HistoryNotification = {
  id: string;
  title: string | null;
  message: string | null;
  link: string | null;
  type: string;
  priority: "low" | "medium" | "high" | "critical";
  visibility: "private" | "role" | "global";
  read: boolean;
  status: "open" | "in_progress" | "resolved" | "dismissed";
  requires_action: boolean;
  resolved_at: string | null;
  archived: boolean;
  created_at: string;
};

export default function AdminNotificationHistoryPage() {
  const [items, setItems] = useState<HistoryNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "resolved" | "dismissed" | "open" | "in_progress">("all");

  useEffect(() => {
    void loadHistory();
  }, []);

  async function loadHistory() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/notifications?includeRead=1&includeHistory=1", {
        headers: getAdminHeaders(),
      });
      if (!res.ok) return;
      const json = await res.json();
      setItems((json.notifications ?? []) as HistoryNotification[]);
    } finally {
      setLoading(false);
    }
  }

  const historyItems = useMemo(() => {
    const archivedOnly = items.filter((item) => item.archived || item.status === "resolved" || item.status === "dismissed");
    if (statusFilter === "all") return archivedOnly;
    return archivedOnly.filter((item) => item.status === statusFilter);
  }, [items, statusFilter]);

  function priorityClass(priority: HistoryNotification["priority"]) {
    if (priority === "critical") return "text-red-300 border-red-500/30 bg-red-500/10";
    if (priority === "high") return "text-yellow-300 border-yellow-500/30 bg-yellow-500/10";
    if (priority === "medium") return "text-blue-300 border-blue-500/30 bg-blue-500/10";
    return "text-white/75 border-white/15 bg-white/[0.04]";
  }

  function statusDot(status: HistoryNotification["status"]) {
    if (status === "resolved") return "bg-green-400";
    if (status === "dismissed") return "bg-white/30";
    if (status === "in_progress") return "bg-blue-400";
    return "bg-yellow-400";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className={ui.h1}>Notification History</h1>
          <p className={`text-sm ${ui.muted2} mt-1`}>
            Archived and resolved admin notifications remain here for audit and review.
          </p>
        </div>
        <Link href="/admin/notifications" className={`${ui.btnGhost} ${ui.btnSmall} text-xs`}>
          Back to Notifications
        </Link>
      </div>

      <div className={`${ui.card} p-4 flex flex-wrap items-center gap-2`}>
        {(["all", "resolved", "dismissed", "open", "in_progress"] as const).map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => setStatusFilter(filter)}
            className={`${ui.btnSmall} rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition ${
              statusFilter === filter
                ? "bg-white/10 text-white border border-white/20"
                : "text-white/50 hover:text-white hover:bg-white/5 border border-transparent"
            }`}
          >
            {filter === "in_progress" ? "in progress" : filter}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={`${ui.card} p-10 text-center`}>
          <p className={ui.muted}>Loading history...</p>
        </div>
      ) : historyItems.length === 0 ? (
        <div className={`${ui.card} p-10 text-center`}>
          <p className={ui.muted}>No archived notifications found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {historyItems.map((item) => (
            <div key={item.id} className={`${ui.card} p-5 space-y-3`}>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${priorityClass(item.priority)}`}>
                      {item.priority}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-white/40">
                      {item.visibility}
                    </span>
                    {item.requires_action && (
                      <span className="text-[10px] uppercase tracking-wide text-yellow-300/80">
                        required action
                      </span>
                    )}
                  </div>
                  <h2 className="text-base font-semibold text-white">
                    {item.title || "Admin Notification"}
                  </h2>
                </div>
                <div className="text-right space-y-1">
                  <div className="flex items-center justify-end gap-2">
                    <span className={`h-2 w-2 rounded-full ${statusDot(item.status)}`} />
                    <span className="text-[11px] uppercase tracking-wide text-white/55">
                      {item.status === "in_progress" ? "In Progress" : item.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-white/35">
                    {new Date(item.created_at).toLocaleString()}
                  </p>
                  {item.resolved_at && (
                    <p className="text-[11px] text-white/35">
                      Resolved {new Date(item.resolved_at).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>

              <p className="text-sm text-white/75 whitespace-pre-wrap">
                {item.message || "No message"}
              </p>

              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-3 text-[11px] text-white/40">
                  <span>{item.read ? "Read" : "Unread"}</span>
                  <span>{item.archived ? "Archived" : "Active"}</span>
                  <span>{item.type}</span>
                </div>
                {item.link ? (
                  <Link href={item.link} className="text-xs text-blue-300 hover:text-blue-200 transition">
                    Open linked page
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
