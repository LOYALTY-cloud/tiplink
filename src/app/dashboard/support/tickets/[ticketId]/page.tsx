"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { ui } from "@/lib/ui";

type TicketMessage = {
  id: string;
  sender_type: string;
  sender_name: string | null;
  message: string;
  file_url: string | null;
  file_type: string | null;
  created_at: string;
};

type Ticket = {
  id: string;
  subject: string;
  category: string;
  status: string;
  priority: number;
  assigned_admin_name?: string;
  created_at: string;
  updated_at: string;
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open: { label: "Open", color: "text-blue-400 bg-blue-500/15" },
  in_progress: { label: "In Progress", color: "text-yellow-400 bg-yellow-500/15" },
  resolved: { label: "Resolved", color: "text-green-400 bg-green-500/15" },
  closed: { label: "Closed", color: "text-white/40 bg-white/5" },
};

const TIMELINE_STEPS = [
  { key: "open", label: "Submitted", icon: "📝" },
  { key: "in_progress", label: "In Progress", icon: "🔧" },
  { key: "resolved", label: "Resolved", icon: "✅" },
  { key: "closed", label: "Closed", icon: "🔒" },
];

function isImageUrl(url: string, fileType: string | null): boolean {
  if (fileType && fileType.startsWith("image/")) return true;
  return /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(url);
}

export default function TicketDetailPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadTicket();

    // Realtime subscription for new messages
    const channel = supabase
      .channel(`ticket-msgs-${ticketId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_ticket_messages",
          filter: `ticket_id=eq.${ticketId}`,
        },
        (payload) => {
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.new.id)) return prev;
            return [...prev, payload.new as TicketMessage];
          });
        }
      )
      .subscribe();

    // Realtime subscription for ticket status changes
    const ticketChannel = supabase
      .channel(`ticket-status-${ticketId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "support_tickets",
          filter: `id=eq.${ticketId}`,
        },
        (payload) => {
          setTicket((prev) =>
            prev ? { ...prev, ...payload.new } as Ticket : prev
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(ticketChannel);
    };
  }, [ticketId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadTicket() {
    setLoading(true);
    const res = await fetch(`/api/support/tickets/${ticketId}`);
    if (res.ok) {
      const data = await res.json();
      setTicket(data.ticket);
      setMessages(data.messages ?? []);
    }
    setLoading(false);
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim() || sending) return;
    setSending(true);

    await fetch(`/api/support/tickets/${ticketId}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: reply.trim() }),
    });

    setReply("");
    setSending(false);
  }

  if (loading) {
    return (
      <div className="max-w-xl mx-auto px-4 py-8 text-center">
        <p className={ui.muted}>Loading ticket...</p>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="max-w-xl mx-auto px-4 py-8 text-center space-y-3">
        <p className={ui.muted}>Ticket not found.</p>
        <Link href="/dashboard/support/tickets" className={`${ui.btnGhost} ${ui.btnSmall} text-sm`}>
          ← Back to Tickets
        </Link>
      </div>
    );
  }

  const st = STATUS_LABELS[ticket.status] ?? STATUS_LABELS.open;
  const isClosed = ticket.status === "closed" || ticket.status === "resolved";

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link
          href="/dashboard/support/tickets"
          className={`${ui.btnGhost} px-3 py-2 ${ui.btnSmall} mt-0.5`}
        >
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold truncate">{ticket.subject}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st.color}`}>
              {st.label}
            </span>
            <span className={`text-xs ${ui.muted2}`}>
              {ticket.category.replace("_", " ")}
            </span>
            <span className={`text-xs ${ui.muted2}`}>
              · {new Date(ticket.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      {/* Status Timeline */}
      <div className={`${ui.cardInner} px-4 py-3`}>
        <div className="flex items-center justify-between">
          {TIMELINE_STEPS.map((step, i) => {
            const statusOrder = ["open", "in_progress", "resolved", "closed"];
            const currentIdx = statusOrder.indexOf(ticket.status);
            const stepIdx = statusOrder.indexOf(step.key);
            const isActive = stepIdx <= currentIdx;
            const isCurrent = step.key === ticket.status;

            return (
              <div key={step.key} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                      isCurrent
                        ? "bg-green-500/20 border-2 border-green-400 ring-2 ring-green-400/20"
                        : isActive
                        ? "bg-green-500/15 border border-green-400/40"
                        : "bg-white/5 border border-white/10"
                    }`}
                  >
                    {step.icon}
                  </div>
                  <span
                    className={`text-[10px] mt-1 ${
                      isCurrent ? "text-green-400 font-semibold" : isActive ? "text-white/60" : "text-white/25"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {i < TIMELINE_STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-2 mt-[-18px] ${
                      stepIdx < currentIdx ? "bg-green-400/40" : "bg-white/10"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Messages thread */}
      <div className={`${ui.card} p-4 space-y-3 max-h-[60vh] overflow-y-auto`}>
        {messages.length === 0 ? (
          <p className={`text-sm ${ui.muted} text-center py-4`}>
            No messages yet.
          </p>
        ) : (
          messages.map((m) => {
            const isUser = m.sender_type === "user";
            const isSystem = m.sender_type === "system";

            if (isSystem) {
              return (
                <div key={m.id} className="text-center">
                  <p className={`text-xs ${ui.muted2} italic`}>{m.message}</p>
                </div>
              );
            }

            return (
              <div
                key={m.id}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                    isUser
                      ? "bg-green-500/15 border border-green-400/20"
                      : "bg-blue-500/15 border border-blue-400/20"
                  }`}
                >
                  {!isUser && m.sender_name && (
                    <p className="text-xs font-semibold text-blue-300 mb-1">
                      {m.sender_name}
                    </p>
                  )}
                  <p className="text-sm leading-relaxed">{m.message}</p>
                  {m.file_url && (
                    <div className="mt-2">
                      {isImageUrl(m.file_url, m.file_type) ? (
                        <a
                          href={m.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block rounded-lg overflow-hidden border border-white/10 hover:border-white/30 transition max-w-[200px]"
                        >
                          <img
                            src={m.file_url}
                            alt="Attachment"
                            className="max-h-[150px] w-auto object-cover"
                            loading="lazy"
                          />
                        </a>
                      ) : (
                        <a
                          href={m.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 hover:bg-white/10 transition"
                        >
                          <span className="text-lg">
                            {m.file_type?.includes("pdf") ? "📄" : m.file_type?.includes("doc") ? "📝" : "📎"}
                          </span>
                          <div className="text-left">
                            <p className="text-xs text-white/80 font-medium truncate max-w-[150px]">
                              {m.message || "File"}
                            </p>
                            <p className="text-[10px] text-white/40">
                              {m.file_type?.split("/")[1]?.toUpperCase() || "FILE"} · Download
                            </p>
                          </div>
                        </a>
                      )}
                    </div>
                  )}
                  <p className={`text-[10px] ${ui.muted2} mt-1`}>
                    {new Date(m.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply box */}
      {!isClosed ? (
        <form onSubmit={handleReply} className="flex gap-2">
          <input
            type="text"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Type a reply..."
            className={`${ui.input} flex-1`}
            maxLength={2000}
          />
          <button
            type="submit"
            disabled={sending || !reply.trim()}
            className={`${ui.btnPrimary} ${ui.btnSmall} px-4`}
          >
            {sending ? "..." : "Send"}
          </button>
        </form>
      ) : (
        <div className={`${ui.cardInner} px-4 py-3 text-center`}>
          <p className={`text-sm ${ui.muted}`}>
            This ticket has been {ticket.status === "resolved" ? "resolved" : "closed"}.
          </p>
        </div>
      )}
    </div>
  );
}
