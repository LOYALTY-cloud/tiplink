"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { ui } from "@/lib/ui";
import ReplySuggestions from "@/components/admin/ReplySuggestions";

type TicketMessage = {
  id: string;
  sender_type: string;
  sender_name: string | null;
  message: string;
  file_url: string | null;
  file_type: string | null;
  is_internal?: boolean;
  created_at: string;
};

type Ticket = {
  id: string;
  user_id: string;
  subject: string;
  category: string;
  status: string;
  priority: number;
  assigned_admin_id: string | null;
  message: string;
  file_url: string | null;
  source: string | null;
  source_session_id: string | null;
  sla_response_deadline: string | null;
  sla_resolve_deadline: string | null;
  first_response_at: string | null;
  waiting_on: string | null;
  breach_notified: boolean;
  breach_count: number;
  created_at: string;
  updated_at: string;
};

type UserProfile = {
  user_id: string;
  display_name: string | null;
  handle: string | null;
  email: string | null;
};

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const QUICK_MACROS = [
  { label: "Check wallet", text: "Could you please check your wallet page and let me know what you see? Go to Dashboard → Wallet." },
  { label: "Issue resolved", text: "We've resolved your issue. Please check your account and confirm everything looks good. Don't hesitate to reach out if you need anything else!" },
  { label: "Need more info", text: "Could you provide a bit more detail so we can investigate further? A screenshot would be very helpful." },
  { label: "Processing time", text: "This is currently being processed. Payouts typically take 1-2 business days to arrive. We'll notify you once it's complete." },
  { label: "Escalated", text: "I've escalated this to our senior team for a closer look. You'll hear back soon." },
];

function getAdminHeaders(): Record<string, string> {
  const raw = localStorage.getItem("admin_session");
  const admin = raw ? JSON.parse(raw) : null;
  return admin?.id ? { "x-admin-id": admin.id } : {};
}

function getSlaStatus(deadline: string | null, met: boolean): { label: string; color: string } {
  if (met) return { label: "Met", color: "text-emerald-400" };
  if (!deadline) return { label: "—", color: "text-white/40" };
  const now = Date.now();
  const target = new Date(deadline).getTime();
  const diff = target - now;
  if (diff <= 0) return { label: "BREACHED", color: "text-red-400 font-bold" };
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours < 1) return { label: `${mins}m left`, color: "text-amber-400" };
  return { label: `${hours}h ${mins}m left`, color: hours < 2 ? "text-amber-400" : "text-emerald-400" };
}

type NextAction = { icon: string; label: string; hint: string };

function getNextBestActions(ticket: Ticket, messageCount: number): NextAction[] {
  const actions: NextAction[] = [];
  if (ticket.status === "resolved" || ticket.status === "closed") return actions;

  if (ticket.breach_count >= 3 && !ticket.assigned_admin_id) {
    actions.push({ icon: "🚨", label: "Take over immediately", hint: "This ticket has breached SLA " + ticket.breach_count + " times" });
  }
  if (ticket.waiting_on === "admin" && !ticket.first_response_at) {
    actions.push({ icon: "⚡", label: "Send first response", hint: "SLA clock is ticking — no response yet" });
  }
  if (ticket.waiting_on === "admin" && ticket.first_response_at) {
    actions.push({ icon: "💬", label: "Reply to user", hint: "User is waiting for your response" });
  }
  if (ticket.waiting_on === "user" && ticket.status === "in_progress") {
    actions.push({ icon: "📨", label: "Send reminder", hint: "Waiting on user — consider a gentle follow-up" });
  }
  if (ticket.breach_notified && ticket.assigned_admin_id) {
    actions.push({ icon: "🔄", label: "Reassign ticket", hint: "SLA breached — consider reassigning if stuck" });
  }
  if (messageCount > 10 && ticket.status !== "resolved") {
    actions.push({ icon: "✅", label: "Consider resolving", hint: "Long thread — check if issue is resolved" });
  }
  return actions;
}

function isImageFile(url: string, fileType: string | null): boolean {
  if (fileType && fileType.startsWith("image/")) return true;
  return /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(url);
}

type ThreadSummary = {
  age: string;
  breachCount: number;
  priorityLabel: string;
  counts: { total: number; user: number; admin: number; internal: number };
  lastUserMessage: { message: string; at: string } | null;
  sla: { responseBreached: boolean; resolveBreached: boolean };
};

export default function AdminTicketDetailPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const router = useRouter();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState<ThreadSummary | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [userHealth, setUserHealth] = useState<{
    totalTickets: number;
    resolvedCount: number;
    unresolvedCount: number;
    resolutionRate: number;
    lastIssue: string | null;
    lastTicketAt: string | null;
    riskLevel: "low" | "medium" | "high";
    topCategory: string | null;
    disputeCount: number;
    accountStatus: string;
    isFlagged: boolean;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadTicket();

    const channel = supabase
      .channel(`admin-ticket-msgs-${ticketId}`)
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticketId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadTicket() {
    setLoading(true);
    let userId: string | null = null;
    const res = await fetch(`/api/admin/tickets/${ticketId}`, {
      headers: getAdminHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      setTicket(data.ticket);
      setMessages(data.messages ?? []);
      setUser(data.user ?? null);
      userId = data.ticket?.user_id ?? null;
    }

    // Load thread summary
    fetch(`/api/admin/tickets/${ticketId}/summary`, {
      headers: getAdminHeaders(),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.summary) setSummary(d.summary); })
      .catch(() => {});

    // Load user health card
    if (userId) {
      fetch(`/api/admin/users/${userId}/health`, {
        headers: getAdminHeaders(),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d?.health) setUserHealth(d.health); })
        .catch(() => {});
    }

    setLoading(false);
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim() || sending) return;
    setSending(true);

    await fetch(`/api/admin/tickets/${ticketId}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAdminHeaders() },
      body: JSON.stringify({ message: reply.trim(), is_internal: isInternalNote }),
    });

    setReply("");
    setIsInternalNote(false);
    setSending(false);
    loadTicket();
  }

  async function handleStatusChange(newStatus: string) {
    setUpdating(true);
    await fetch(`/api/admin/tickets/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...getAdminHeaders() },
      body: JSON.stringify({ status: newStatus }),
    });
    setTicket((prev) => (prev ? { ...prev, status: newStatus } : prev));
    setUpdating(false);
  }

  async function handleTakeOver() {
    const raw = localStorage.getItem("admin_session");
    const admin = raw ? JSON.parse(raw) : null;
    if (!admin?.id) return;

    setUpdating(true);
    await fetch(`/api/admin/tickets/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...getAdminHeaders() },
      body: JSON.stringify({
        assigned_admin_id: admin.userId || admin.id,
        status: "in_progress",
      }),
    });
    loadTicket();
    setUpdating(false);
  }

  async function handleFileUpload(file: File) {
    if (file.size > 10 * 1024 * 1024) { alert("File must be under 10MB"); return; }
    setUploading(true);
    const filePath = `tickets/${ticketId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: uploadErr } = await supabase.storage.from("support-files").upload(filePath, file);
    if (uploadErr) { setUploading(false); alert("Upload failed: " + uploadErr.message); return; }
    const { data: urlData } = supabase.storage.from("support-files").getPublicUrl(filePath);

    await fetch(`/api/admin/tickets/${ticketId}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAdminHeaders() },
      body: JSON.stringify({
        message: file.name,
        file_url: urlData.publicUrl,
        file_type: file.type,
        is_internal: isInternalNote,
      }),
    });

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    loadTicket();
  }

  async function handleStartChat() {
    if (!ticket) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/admin/tickets/${ticketId}/start-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
      });
      const data = await res.json();
      if (res.ok && data.sessionId) {
        router.push(`/admin/support/${data.sessionId}`);
      }
    } catch {
      // silent
    }
    setUpdating(false);
  }

  async function loadAiSuggestions() {
    setAiLoading(true);
    try {
      const res = await fetch(`/api/admin/tickets/${ticketId}/suggest`, {
        headers: getAdminHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setAiSuggestions(data.suggestions ?? []);
      }
    } catch {
      // silent
    }
    setAiLoading(false);
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <p className={ui.muted}>Loading ticket...</p>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center space-y-3">
        <p className={ui.muted}>Ticket not found.</p>
        <button
          onClick={() => router.push("/admin/tickets")}
          className={`${ui.btnGhost} ${ui.btnSmall} text-sm`}
        >
          ← Back
        </button>
      </div>
    );
  }

  return (
    <>
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <button
            onClick={() => router.push("/admin/tickets")}
            className={`text-sm ${ui.muted} hover:text-white transition mb-2 block`}
          >
            ← Back to Tickets
          </button>
          <h1 className="text-xl font-semibold">{ticket.subject}</h1>
          <p className={`text-xs ${ui.muted2} mt-1`}>
            #{ticket.id.slice(0, 8)} · {ticket.category.replace("_", " ")} ·{" "}
            {new Date(ticket.created_at).toLocaleString()}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleStartChat}
            className={`${ui.btnGhost} ${ui.btnSmall} text-sm`}
            title="Open live chat with this user"
          >
            💬 Chat
          </button>
          <select
            value={ticket.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            disabled={updating}
            className={`${ui.select} text-sm py-2 w-auto`}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {!ticket.assigned_admin_id && (
            <button
              onClick={handleTakeOver}
              disabled={updating}
              className={`${ui.btnPrimary} ${ui.btnSmall} text-sm`}
            >
              Take Over
            </button>
          )}
        </div>
      </div>

      {/* Breach warning */}
      {ticket.breach_notified && (
        <div className="bg-red-500/10 border border-red-400/20 rounded-xl px-4 py-2.5 flex items-center gap-2">
          <span className="text-red-400 text-sm font-semibold">
            ⚠️ SLA BREACHED{ticket.breach_count > 1 ? ` (${ticket.breach_count}x)` : ""}
          </span>
          <span className={`text-xs ${ui.muted2}`}>
            {ticket.breach_count >= 3
              ? "Auto-reassigned. Requires immediate owner attention."
              : "Priority was auto-escalated. Respond ASAP."}
          </span>
        </div>
      )}

      {/* Waiting-on badge */}
      {ticket.waiting_on && ticket.status !== "resolved" && ticket.status !== "closed" && (
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            ticket.waiting_on === "admin"
              ? "bg-blue-500/15 text-blue-400"
              : "bg-white/5 text-white/40"
          }`}>
            {ticket.waiting_on === "admin" ? "⏳ Needs your reply" : "Waiting on user"}
          </span>
        </div>
      )}

      {/* Next Best Actions */}
      {(() => {
        const actions = getNextBestActions(ticket, messages.length);
        if (actions.length === 0) return null;
        return (
          <div className="flex gap-2 flex-wrap">
            {actions.map((a, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 text-xs bg-indigo-500/10 border border-indigo-400/15 rounded-lg px-3 py-1.5"
                title={a.hint}
              >
                <span>{a.icon}</span>
                <span className="text-indigo-300 font-medium">{a.label}</span>
              </div>
            ))}
          </div>
        );
      })()}

      <div className="grid md:grid-cols-[1fr_260px] gap-4">
        {/* Messages */}
        <div className={`${ui.card} p-4 space-y-3 max-h-[65vh] overflow-y-auto`}>
          {messages.map((m) => {
            const isUser = m.sender_type === "user";
            const isSystem = m.sender_type === "system";
            const isInternal = m.is_internal === true;

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
                className={`flex ${isUser ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                    isInternal
                      ? "bg-amber-500/10 border border-amber-400/20 border-dashed"
                      : isUser
                      ? "bg-white/5 border border-white/10"
                      : "bg-blue-500/15 border border-blue-400/20"
                  }`}
                >
                  {isInternal && (
                    <p className="text-[10px] text-amber-400 font-semibold uppercase mb-1">Internal Note</p>
                  )}
                  <p className="text-xs font-semibold text-white/60 mb-1">
                    {isUser ? (user?.display_name ?? "User") : (m.sender_name ?? "Admin")}
                  </p>
                  <p className="text-sm leading-relaxed">{m.message}</p>
                  {m.file_url && (
                    <div className="mt-2">
                      {isImageFile(m.file_url, m.file_type) ? (
                        <button
                          onClick={() => setLightboxUrl(m.file_url)}
                          className="block rounded-lg overflow-hidden border border-white/10 hover:border-white/30 transition max-w-[200px]"
                        >
                          <img
                            src={m.file_url}
                            alt="Attachment"
                            className="max-h-[150px] w-auto object-cover"
                            loading="lazy"
                          />
                        </button>
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
          })}
          <div ref={bottomRef} />
        </div>

        {/* Sidebar */}
        <div className="space-y-3">
          {/* User card */}
          {user && (
            <div className={`${ui.cardInner} p-4 space-y-2`}>
              <p className="text-xs font-semibold text-white/50 uppercase">User</p>
              <p className="font-medium text-sm">
                {user.display_name || "—"}
              </p>
              {user.handle && (
                <p className={`text-xs ${ui.muted2}`}>@{user.handle}</p>
              )}
              {user.email && (
                <p className={`text-xs ${ui.muted2}`}>{user.email}</p>
              )}
              <a
                href={`/admin/users/${user.user_id}`}
                className="text-xs text-blue-400 underline block"
              >
                View profile →
              </a>
            </div>
          )}

          {/* User Health Card */}
          {userHealth && (
            <div className={`${ui.cardInner} p-4 space-y-2`}>
              <p className="text-xs font-semibold text-white/50 uppercase">User Health</p>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between items-center">
                  <span className={ui.muted2}>Risk</span>
                  <span className={`text-xs font-semibold ${
                    userHealth.riskLevel === "high" ? "text-red-400" :
                    userHealth.riskLevel === "medium" ? "text-amber-400" : "text-emerald-400"
                  }`}>
                    {userHealth.riskLevel === "high" ? "🔴" : userHealth.riskLevel === "medium" ? "🟡" : "🟢"}{" "}
                    {userHealth.riskLevel.toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className={ui.muted2}>Tickets</span>
                  <span className="text-xs">{userHealth.totalTickets}</span>
                </div>
                <div className="flex justify-between">
                  <span className={ui.muted2}>Resolution</span>
                  <span className={`text-xs ${
                    userHealth.resolutionRate >= 80 ? "text-emerald-400" :
                    userHealth.resolutionRate >= 50 ? "text-amber-400" : "text-red-400"
                  }`}>
                    {userHealth.resolutionRate}%
                  </span>
                </div>
                {userHealth.disputeCount > 0 && (
                  <div className="flex justify-between">
                    <span className={ui.muted2}>Disputes</span>
                    <span className="text-xs text-red-400">{userHealth.disputeCount}</span>
                  </div>
                )}
                {userHealth.topCategory && (
                  <div className="flex justify-between">
                    <span className={ui.muted2}>Top issue</span>
                    <span className="text-xs">{userHealth.topCategory}</span>
                  </div>
                )}
                {userHealth.lastIssue && (
                  <div className="flex justify-between">
                    <span className={ui.muted2}>Last type</span>
                    <span className="text-xs">{userHealth.lastIssue}</span>
                  </div>
                )}
                {userHealth.lastTicketAt && (
                  <div className="flex justify-between">
                    <span className={ui.muted2}>Last ticket</span>
                    <span className="text-xs">{new Date(userHealth.lastTicketAt).toLocaleDateString()}</span>
                  </div>
                )}
                {userHealth.isFlagged && (
                  <div className="mt-1 text-xs text-red-400 font-medium">
                    ⚠️ Account flagged
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Ticket info */}
          <div className={`${ui.cardInner} p-4 space-y-2`}>
            <p className="text-xs font-semibold text-white/50 uppercase">
              Ticket Info
            </p>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className={ui.muted2}>Priority</span>
                <span>
                  {ticket.priority === 3
                    ? "🔴 Critical"
                    : ticket.priority === 2
                    ? "🟠 High"
                    : ticket.priority === 1
                    ? "🟡 Medium"
                    : "⚪ Normal"}
                </span>
              </div>
              {ticket.source === "chat" && (
                <div className="flex justify-between">
                  <span className={ui.muted2}>Source</span>
                  <span className="text-xs text-blue-400">💬 Chat</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className={ui.muted2}>Created</span>
                <span className="text-xs">
                  {new Date(ticket.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className={ui.muted2}>Updated</span>
                <span className="text-xs">
                  {new Date(ticket.updated_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          {/* SLA Timers */}
          {(ticket.sla_response_deadline || ticket.sla_resolve_deadline) && (
            <div className={`${ui.cardInner} p-4 space-y-2`}>
              <p className="text-xs font-semibold text-white/50 uppercase">
                SLA Timers
              </p>
              <div className="space-y-1.5 text-sm">
                {ticket.sla_response_deadline && (
                  <div className="flex justify-between items-center">
                    <span className={ui.muted2}>Response</span>
                    {(() => {
                      const s = getSlaStatus(ticket.sla_response_deadline, !!ticket.first_response_at);
                      return <span className={`text-xs ${s.color}`}>{s.label}</span>;
                    })()}
                  </div>
                )}
                {ticket.sla_resolve_deadline && (
                  <div className="flex justify-between items-center">
                    <span className={ui.muted2}>Resolve</span>
                    {(() => {
                      const s = getSlaStatus(ticket.sla_resolve_deadline, ticket.status === "resolved" || ticket.status === "closed");
                      return <span className={`text-xs ${s.color}`}>{s.label}</span>;
                    })()}
                  </div>
                )}
                {ticket.first_response_at && (
                  <div className="flex justify-between">
                    <span className={ui.muted2}>First reply</span>
                    <span className="text-xs text-white/60">
                      {new Date(ticket.first_response_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {ticket.file_url && (
            <div className={`${ui.cardInner} p-4`}>
              <p className="text-xs font-semibold text-white/50 uppercase mb-2">
                Attachment
              </p>
              <a
                href={ticket.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-400 underline"
              >
                📎 View file
              </a>
            </div>
          )}

          {/* Thread Summary */}
          {summary && (
            <div className={`${ui.cardInner} p-4 space-y-2`}>
              <p className="text-xs font-semibold text-white/50 uppercase">
                Thread Summary
              </p>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className={ui.muted2}>Age</span>
                  <span className="text-xs">{summary.age}</span>
                </div>
                <div className="flex justify-between">
                  <span className={ui.muted2}>Messages</span>
                  <span className="text-xs">
                    {summary.counts.total} ({summary.counts.user} user / {summary.counts.admin} admin)
                  </span>
                </div>
                {summary.counts.internal > 0 && (
                  <div className="flex justify-between">
                    <span className={ui.muted2}>Notes</span>
                    <span className="text-xs text-amber-400">{summary.counts.internal} internal</span>
                  </div>
                )}
                {summary.breachCount > 0 && (
                  <div className="flex justify-between">
                    <span className={ui.muted2}>Breaches</span>
                    <span className="text-xs text-red-400">{summary.breachCount}x</span>
                  </div>
                )}
                {summary.lastUserMessage && (
                  <div className="mt-2 border-t border-white/5 pt-2">
                    <p className="text-[10px] text-white/40 uppercase mb-1">Last from user</p>
                    <p className="text-xs text-white/60 line-clamp-3">{summary.lastUserMessage.message}</p>
                    <p className="text-[10px] text-white/30 mt-0.5">
                      {new Date(summary.lastUserMessage.at).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reply box */}
      {ticket.status !== "closed" && (
        <div className="space-y-2">
          {/* Quick macros */}
          <div className="flex gap-1.5 flex-wrap">
            {QUICK_MACROS.map((m) => (
              <button
                key={m.label}
                onClick={() => setReply(m.text)}
                className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70 transition"
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* AI Reply Suggestions */}
          <ReplySuggestions
            ticketCategory={ticket.category}
            ticketStatus={ticket.status}
            onSelect={(text) => setReply(text)}
          />

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isInternalNote}
                onChange={(e) => setIsInternalNote(e.target.checked)}
                className="accent-amber-500 w-3.5 h-3.5"
              />
              <span className={`text-xs ${isInternalNote ? "text-amber-400" : "text-white/40"}`}>
                Internal note (not visible to user)
              </span>
            </label>
          </div>
          <form onSubmit={handleReply} className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,.doc,.docx,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-white/40 hover:text-white/70 text-lg transition shrink-0 self-center"
              title="Attach file"
            >
              {uploading ? <span className="animate-spin inline-block text-sm">⏳</span> : "📎"}
            </button>
            <input
              type="text"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder={isInternalNote ? "Write internal note..." : "Type admin reply..."}
              className={`${ui.input} flex-1 ${isInternalNote ? "border-amber-400/30" : ""}`}
              maxLength={2000}
            />
            <button
              type="submit"
              disabled={sending || !reply.trim()}
              className={`${isInternalNote ? "bg-amber-500/80 hover:bg-amber-600" : ""} ${!isInternalNote ? ui.btnPrimary : "text-white font-medium rounded-xl"} ${ui.btnSmall} px-5`}
            >
              {sending ? "..." : isInternalNote ? "Note" : "Reply"}
            </button>
          </form>
        </div>
      )}
    </div>

    {/* Image lightbox */}
    {lightboxUrl && (
      <div
        className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
        onClick={() => setLightboxUrl(null)}
      >
        <div className="relative max-w-3xl max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute -top-3 -right-3 w-8 h-8 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition text-sm"
          >
            ✕
          </button>
          <img
            src={lightboxUrl}
            alt="Full size"
            className="max-h-[80vh] max-w-full rounded-xl object-contain"
          />
          <a
            href={lightboxUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center mt-2 text-xs text-blue-400 hover:text-blue-300"
          >
            Open in new tab ↗
          </a>
        </div>
      </div>
    )}
    </>
  );
}
