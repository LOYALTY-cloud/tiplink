"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { ui } from "@/lib/ui";
import { dispatchAIContext } from "@/lib/dispatchAIContext";

type Ticket = {
  id: string;
  user_id: string;
  subject: string;
  category: string;
  status: string;
  priority: number;
  assigned_admin_id: string | null;
  waiting_on: string | null;
  breach_notified: boolean;
  sla_response_deadline: string | null;
  first_response_at: string | null;
  created_at: string;
  updated_at: string;
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open: { label: "OPEN", color: "text-blue-400 bg-blue-500/15" },
  in_progress: { label: "IN PROGRESS", color: "text-yellow-400 bg-yellow-500/15" },
  resolved: { label: "RESOLVED", color: "text-green-400 bg-green-500/15" },
  closed: { label: "CLOSED", color: "text-white/40 bg-white/5" },
};

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  3: { label: "CRITICAL", color: "text-red-400" },
  2: { label: "HIGH", color: "text-orange-400" },
  1: { label: "MED", color: "text-yellow-400" },
  0: { label: "", color: "" },
};

export default function AdminTicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    loadTickets();

    const channel = supabase
      .channel("admin-tickets-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_tickets" },
        () => loadTickets()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [filter]);

  async function loadTickets() {
    setLoading(true);
    const raw = localStorage.getItem("admin_session");
    const admin = raw ? JSON.parse(raw) : null;

    const url = `/api/admin/tickets${filter !== "all" ? `?status=${filter}` : ""}`;
    const res = await fetch(url, {
      headers: admin?.id ? { "x-admin-id": admin.id } : {},
    });

    if (res.ok) {
      const data = await res.json();
      const list = data.tickets ?? [];
      setTickets(list);
      dispatchAIContext({
        open_count: list.filter((t: Ticket) => t.status === "open").length,
        in_progress_count: list.filter((t: Ticket) => t.status === "in_progress").length,
        total_tickets: list.length,
        sla_breaching: list.filter((t: Ticket) => t.breach_notified).length,
      });
    }
    setLoading(false);
  }

  const counts = {
    all: tickets.length,
    open: tickets.filter((t) => t.status === "open").length,
    in_progress: tickets.filter((t) => t.status === "in_progress").length,
    resolved: tickets.filter((t) => t.status === "resolved").length,
  };

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 space-y-6">
      <div>
        <h1 className={ui.h1}>Support Tickets</h1>
        <p className={`mt-1 ${ui.muted}`}>
          Manage async support requests from users.
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: "all", label: `All (${counts.all})` },
          { key: "open", label: `Open (${counts.open})` },
          { key: "in_progress", label: `In Progress (${counts.in_progress})` },
          { key: "resolved", label: `Resolved (${counts.resolved})` },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`${ui.btnSmall} ${
              filter === tab.key ? ui.navActive : ui.navIdle
            } px-3 py-1.5 text-sm`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Ticket list */}
      {loading ? (
        <div className="text-center py-8">
          <p className={ui.muted}>Loading...</p>
        </div>
      ) : tickets.length === 0 ? (
        <div className={`${ui.card} px-5 py-8 text-center`}>
          <p className={ui.muted}>No tickets found.</p>
        </div>
      ) : (
        <div id="ticket-list" className="space-y-2">
          {tickets.map((t) => {
            const st = STATUS_LABELS[t.status] ?? STATUS_LABELS.open;
            const pr = PRIORITY_LABELS[t.priority] ?? PRIORITY_LABELS[0];

            return (
              <Link
                key={t.id}
                href={`/admin/tickets/${t.id}`}
                className={`${ui.card} block px-4 py-3 hover:bg-white/[0.08] transition`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {t.breach_notified && (
                        <span className="text-[10px] font-bold text-red-400">⚠️ SLA</span>
                      )}
                      <p className="font-medium text-sm truncate">
                        {t.subject}
                      </p>
                      {pr.label && (
                        <span className={`text-[10px] font-bold ${pr.color}`}>
                          {pr.label}
                        </span>
                      )}
                    </div>
                    <p className={`text-xs ${ui.muted2} mt-0.5`}>
                      {t.category.replace("_", " ")} · #{t.id.slice(0, 8)} ·{" "}
                      {new Date(t.created_at).toLocaleDateString()}{" "}
                      {new Date(t.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {t.waiting_on && t.status !== "resolved" && t.status !== "closed" && (
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        t.waiting_on === "admin"
                          ? "bg-blue-500/15 text-blue-400"
                          : "bg-white/5 text-white/30"
                      }`}>
                        {t.waiting_on === "admin" ? "Needs reply" : "Waiting on user"}
                      </span>
                    )}
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.color}`}
                    >
                      {st.label}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
