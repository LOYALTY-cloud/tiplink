"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseAdmin as supabase } from "@/lib/supabase/adminBrowserClient";
import { ui } from "@/lib/ui";
import { dispatchAIContext } from "@/lib/dispatchAIContext";
import { getAdminHeaders } from "@/lib/auth/adminSession";

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
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
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
  }, []);

  async function loadTickets() {
    setLoading(true);
    try {
      // Always fetch all tickets — filtering is done client-side so counts stay accurate
      const res = await fetch("/api/admin/tickets", {
        headers: getAdminHeaders(),
      });

      if (res.ok) {
        const data = await res.json();
        const list = data.tickets ?? [];

        // Sort newest to oldest
        list.sort((a: Ticket, b: Ticket) => {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        setAllTickets(list);
        dispatchAIContext({
          open_count: list.filter((t: Ticket) => t.status === "open").length,
          in_progress_count: list.filter((t: Ticket) => t.status === "in_progress").length,
          total_tickets: list.length,
          sla_breaching: list.filter((t: Ticket) => t.breach_notified).length,
        });
      }
    } catch (e) {
      console.error("loadTickets failed:", e);
    } finally {
      setLoading(false);
    }
  }

  // Apply tab filter client-side so counts always reflect the full dataset
  const tickets = filter === "all" ? allTickets
    : filter === "breaching" ? allTickets.filter((t) => t.breach_notified)
    : allTickets.filter((t) => t.status === filter);

  const counts = {
    all: allTickets.length,
    open: allTickets.filter((t) => t.status === "open").length,
    in_progress: allTickets.filter((t) => t.status === "in_progress").length,
    resolved: allTickets.filter((t) => t.status === "resolved").length,
    closed: allTickets.filter((t) => t.status === "closed").length,
    breaching: allTickets.filter((t) => t.breach_notified).length,
  };

  const tabs = [
    { key: "all", label: `All (${counts.all})` },
    { key: "open", label: `Open (${counts.open})` },
    { key: "in_progress", label: `In Progress (${counts.in_progress})` },
    { key: "resolved", label: `Resolved (${counts.resolved})` },
    { key: "closed", label: `Closed (${counts.closed})` },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className={ui.h1}>Support Tickets</h1>
        <p className={`mt-1 ${ui.muted}`}>
          Support inbox ordered newest to oldest.
        </p>
      </div>

      {/* Metrics bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Open" value={counts.open} color="blue" />
        <Stat label="In Progress" value={counts.in_progress} color="yellow" />
        <Stat label="Breaching SLA" value={counts.breaching} color="red" />
        <Stat label="Resolved" value={counts.resolved} color="green" />
      </div>

      {/* Filter nav */}
      <div className="flex gap-2 p-1 bg-white/[.03] border border-white/10 rounded-xl w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-3 py-1.5 text-xs rounded-lg transition ${
              filter === tab.key
                ? "bg-white/10 text-white"
                : "text-white/40 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Ticket list */}
      {loading ? (
        <div className="text-center py-12">
          <p className={ui.muted}>Loading tickets...</p>
        </div>
      ) : tickets.length === 0 ? (
        <div className={`${ui.card} p-8 text-center`}>
          <p className="text-white/60 font-medium">No active tickets</p>
          <p className="text-xs text-white/40 mt-1">You&apos;re all caught up</p>
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
                className={`${ui.card} group relative block px-4 py-3 hover:bg-white/[.04] transition border border-white/5`}
              >
                {/* Hover action */}
                <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition">
                  <span className="text-xs text-blue-400">Open →</span>
                </div>

                <div className="flex items-start justify-between gap-4">
                  {/* Left side */}
                  <div className="flex-1 min-w-0">
                    {/* Top line */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {t.breach_notified && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-bold animate-pulse">
                          SLA BREACH
                        </span>
                      )}
                      {pr.label && (
                        <span className={`text-[10px] font-bold ${pr.color}`}>
                          {pr.label}
                        </span>
                      )}
                      <p className="font-semibold text-sm truncate group-hover:text-white">
                        {t.subject}
                      </p>
                    </div>

                    {/* Meta */}
                    <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px] text-white/40">
                      <span className="capitalize">{t.category.replace("_", " ")}</span>
                      <span>•</span>
                      <span>#{t.id.slice(0, 6)}</span>
                      <span>•</span>
                      <span>
                        {new Date(t.created_at).toLocaleDateString()}{" "}
                        {new Date(t.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>

                    {/* SLA timer */}
                    {t.sla_response_deadline && t.status !== "resolved" && t.status !== "closed" && (
                      <p className={`text-[11px] mt-1 ${
                        new Date(t.sla_response_deadline).getTime() < Date.now()
                          ? "text-red-400"
                          : "text-yellow-400"
                      }`}>
                        ⏱ {new Date(t.sla_response_deadline).getTime() < Date.now() ? "Overdue — was due" : "Due"}{" "}
                        {new Date(t.sla_response_deadline).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    )}
                  </div>

                  {/* Right side */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {t.waiting_on && t.status !== "resolved" && t.status !== "closed" && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                        t.waiting_on === "admin"
                          ? "bg-blue-500/15 text-blue-400"
                          : "bg-white/5 text-white/40"
                      }`}>
                        {t.waiting_on === "admin" ? "Needs reply" : "User reply"}
                      </span>
                    )}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${st.color}`}>
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

function Stat({ label, value, color }: { label: string; value: number; color: "blue" | "yellow" | "red" | "green" }) {
  const styles: Record<string, string> = {
    blue: "text-blue-400 bg-blue-500/10",
    yellow: "text-yellow-400 bg-yellow-500/10",
    red: "text-red-400 bg-red-500/10",
    green: "text-green-400 bg-green-500/10",
  };

  return (
    <div className="rounded-xl border border-white/10 p-3 bg-white/[.02]">
      <p className="text-[10px] text-white/40 uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-bold ${styles[color]}`}>{value}</p>
    </div>
  );
}
