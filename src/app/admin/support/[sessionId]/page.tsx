"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/adminBrowserClient";
import { getAdminHeaders } from "@/lib/auth/adminSession";
import { getInitials } from "@/lib/getInitials";

/** Turn plain-text URLs into clickable links */
function Linkify({ text, className }: { text: string; className?: string }) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return (
    <>
      {parts.map((part, i) =>
        urlRegex.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className={className || "underline break-all"}
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

type Session = {
  id: string;
  user_id: string | null;
  status: string;
  last_message: string | null;
  assigned_admin_id: string | null;
  assigned_admin_name: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

type ChatMessage = {
  id: string;
  session_id: string;
  sender_type: "user" | "admin" | "system";
  sender_id: string | null;
  sender_name: string | null;
  message: string;
  created_at: string;
  seen_at: string | null;
  file_url: string | null;
  file_type: string | null;
};

type AdminOption = {
  id: string;
  display_name: string | null;
  handle: string | null;
};

/* ── Helper components ─────────────────────────── */

function MessageBubble({ msg, isGrouped, isLastAdmin }: { msg: ChatMessage; isGrouped: boolean; isLastAdmin?: boolean }) {
  const [hovered, setHovered] = useState(false);

  if (msg.sender_type === "system") {
    return (
      <div className="text-center text-xs text-white/40 py-1 animate-[fadeIn_0.2s_ease]">
        {msg.message}
      </div>
    );
  }

  const isAgent = msg.sender_type === "admin";
  const displayName = isAgent ? (msg.sender_name || "Admin") : (msg.sender_name || "User");
  const initials = getInitials(displayName);
  const avatarColor = isAgent ? "bg-blue-500" : "bg-gray-500";

  return (
    <div
      className={`flex ${isAgent ? "justify-end" : "justify-start"} animate-[fadeIn_0.2s_ease] group`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-start gap-2.5 max-w-[75%]">

        {/* Avatar LEFT for user */}
        {!isAgent && (
          isGrouped ? (
            <div className="w-8 shrink-0" />
          ) : (
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0 ${avatarColor}`}>
              {initials}
            </div>
          )
        )}

        <div className="relative min-w-0">
          {!isGrouped && (
            <p className="text-[10px] mb-1 opacity-50">
              {displayName}
              <span className="ml-2">
                {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </p>
          )}
          <div
            className={`px-3 py-2 text-sm leading-relaxed ${
              isAgent
                ? "bg-emerald-500 text-black"
                : "bg-white/10 text-white/90"
            } ${
              isGrouped
                ? isAgent
                  ? "rounded-2xl rounded-tr-sm mt-0.5"
                  : "rounded-2xl rounded-tl-sm mt-0.5"
                : isAgent
                ? "rounded-2xl rounded-br-sm"
                : "rounded-2xl rounded-bl-sm"
            }`}
          >
          <Linkify text={msg.message} className={isAgent ? "underline text-black/80 break-all" : "underline text-blue-400 break-all"} />
          {msg.file_url && (
            msg.file_type?.startsWith("image") ? (
              <img
                src={msg.file_url}
                alt="Attachment"
                className="rounded-xl mt-2 max-w-[200px] cursor-pointer hover:opacity-80 transition"
                onClick={() => window.open(msg.file_url!, "_blank")}
              />
            ) : (
              <a
                href={msg.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1 mt-2 text-xs font-medium ${isAgent ? "text-black/70 underline" : "text-blue-400 underline"}`}
              >
                📎 View attachment
              </a>
            )
          )}
        </div>
        {/* Hover action: copy */}
        {hovered && msg.message && (
          <button
            onClick={() => { navigator.clipboard.writeText(msg.message); }}
            className={`absolute ${isAgent ? "-left-8" : "-right-8"} top-1 text-white/20 hover:text-white/60 text-xs transition`}
            title="Copy"
          >
            📋
          </button>
        )}
        {isAgent && isLastAdmin && (
          <p className="text-[10px] text-white/30 text-right mt-0.5 pr-1">
            {msg.seen_at ? "Seen" : "Delivered"}
          </p>
        )}
      </div>

        {/* Avatar RIGHT for admin */}
        {isAgent && (
          isGrouped ? (
            <div className="w-8 shrink-0" />
          ) : (
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0 ${avatarColor}`}>
              {initials}
            </div>
          )
        )}

      </div>
    </div>
  );
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2 text-sm hover:bg-white/10 rounded-lg transition"
    >
      {label}
    </button>
  );
}

function QuickAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-xs px-3 py-1 bg-white/10 hover:bg-white/20 rounded-full whitespace-nowrap transition active:scale-95"
    >
      {label}
    </button>
  );
}

type UserCard = {
  profile: {
    handle: string | null;
    display_name: string | null;
    email: string | null;
    account_status: string | null;
    role: string | null;
    created_at: string;
    is_flagged: boolean | null;
  } | null;
  wallet: { balance: number } | null;
  transactions: Array<{ id: string; type: string; amount: number; status: string | null; created_at: string }>;
  tipCount: number;
  supportSessions: Array<{
    id: string;
    status: string;
    last_message: string | null;
    assigned_admin_name: string | null;
    closed_by: string | null;
    closed_at: string | null;
    created_at: string;
  }>;
};

export default function AdminChatPage() {
  const { sessionId } = useParams();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [taking, setTaking] = useState(false);
  const [userTyping, setUserTyping] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [userCard, setUserCard] = useState<UserCard | null>(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [admins, setAdmins] = useState<AdminOption[]>([]);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferStatus, setTransferStatus] = useState<"idle" | "pending" | "accepted" | "declined">("idle");
  const [transferNotifId, setTransferNotifId] = useState<string | null>(null);
  const [declineReasonText, setDeclineReasonText] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputTypingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch session details + messages via API (service-role bypasses RLS)
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/admin/support/sessions/${sessionId}`, {
          headers: getAdminHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          setSession(data.session);
          setMessages(data.messages || []);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }

    if (sessionId) load();
  }, [sessionId]);

  // Realtime updates for this session
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabaseAdmin
      .channel(`support-session-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "support_sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          setSession(payload.new as Session);
        }
      )
      .subscribe();

    return () => {
      supabaseAdmin.removeChannel(channel);
    };
  }, [sessionId]);

  // Realtime messages subscription
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabaseAdmin
      .channel(`support-messages-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          setUserTyping(false);
          const newMsg = payload.new as ChatMessage;
          setMessages((prev) => {
            // Deduplicate by id
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            // Replace optimistic admin message with the real one
            if (newMsg.sender_type === "admin") {
              const optimisticIdx = prev.findIndex(
                (m) => m.id.startsWith("optimistic-") && m.sender_type === "admin" && m.message === newMsg.message
              );
              if (optimisticIdx !== -1) {
                const updated = [...prev];
                updated[optimisticIdx] = newMsg;
                return updated;
              }
            }
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();

    return () => {
      supabaseAdmin.removeChannel(channel);
    };
  }, [sessionId]);

  // Typing indicator subscription
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabaseAdmin
      .channel(`support-typing-admin-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "support_typing",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as { user_typing?: boolean };
          setUserTyping(!!row.user_typing);
        }
      )
      .subscribe();

    return () => {
      supabaseAdmin.removeChannel(channel);
    };
  }, [sessionId]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Mark unseen user messages as seen when admin views them
  useEffect(() => {
    if (!sessionId || !messages.length) return;
    const unseenIds = messages
      .filter((m) => m.sender_type === "user" && !m.seen_at)
      .map((m) => m.id);
    if (unseenIds.length === 0) return;

    fetch(`/api/admin/support/sessions/${sessionId}/seen`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAdminHeaders() },
    }).then(() => {
      setMessages((prev) =>
        prev.map((m) =>
          m.sender_type === "user" && !m.seen_at
            ? { ...m, seen_at: new Date().toISOString() }
            : m
        )
      );
    }).catch(() => {});
  }, [sessionId, messages.length]);

  // Load admin list for transfer dropdown
  useEffect(() => {
    async function loadAdmins() {
      try {
        const res = await fetch("/api/admin/support/sessions", {
          headers: getAdminHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          const adminProfiles = (data.admins || []).map((a: { user_id: string; display_name: string | null }) => ({
            id: a.user_id,
            display_name: a.display_name,
            handle: null,
          }));
          setAdmins(adminProfiles);
        }
      } catch {}
    }
    loadAdmins();
  }, []);

  // Listen for transfer notification status updates (sender feedback)
  useEffect(() => {
    if (!transferNotifId) return;

    const channel = supabaseAdmin
      .channel(`transfer-notif-${transferNotifId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "support_notifications",
          filter: `id=eq.${transferNotifId}`,
        },
        (payload) => {
          const updated = payload.new as { status: string; metadata?: { decline_reason?: string } };
          if (updated.status === "accepted") {
            setTransferStatus("accepted");
            // Redirect after brief confirmation
            setTimeout(() => {
              setTransferStatus("idle");
              setTransferNotifId(null);
              setDeclineReasonText(null);
              router.push("/admin/support");
            }, 1500);
          } else if (updated.status === "declined") {
            setTransferStatus("declined");
            setDeclineReasonText(updated.metadata?.decline_reason || null);
            setTimeout(() => {
              setTransferStatus("idle");
              setTransferNotifId(null);
              setDeclineReasonText(null);
            }, 5000);
          }
        }
      )
      .subscribe();

    return () => {
      supabaseAdmin.removeChannel(channel);
    };
  }, [transferNotifId, router]);

  // Load user profile card on demand
  async function loadUserCard() {
    if (!session?.user_id || userCard) { setCardOpen(true); return; }
    setCardLoading(true);
    setCardOpen(true);

    try {
      const res = await fetch(`/api/admin/support/sessions/${sessionId}/user-card`, {
        headers: getAdminHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setUserCard(data);
      }
    } catch {}
    setCardLoading(false);
  }

  // Typing indicator: set admin_typing on input change
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInput(e.target.value);

    fetch(`/api/admin/support/sessions/${sessionId}/typing`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAdminHeaders() },
      body: JSON.stringify({ typing: true }),
    }).catch(() => {});

    if (inputTypingRef.current) clearTimeout(inputTypingRef.current);
    inputTypingRef.current = setTimeout(() => {
      fetch(`/api/admin/support/sessions/${sessionId}/typing`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify({ typing: false }),
      }).catch(() => {});
    }, 1200);
  }

  // File upload handler
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !sessionId) return;

    // 10MB limit
    if (file.size > 10 * 1024 * 1024) {
      alert("File must be under 10MB");
      return;
    }

    setUploading(true);
    const raw = localStorage.getItem("admin_session");
    const admin = raw ? JSON.parse(raw) : { id: null, name: "Admin" };
    const filePath = `${sessionId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from("support-files")
      .upload(filePath, file);

    if (uploadErr) {
      setUploading(false);
      alert("Upload failed: " + uploadErr.message);
      return;
    }

    const { data: urlData } = supabaseAdmin.storage
      .from("support-files")
      .getPublicUrl(filePath);

    // Optimistic local update for file message
    const optimisticFileMsg: ChatMessage = {
      id: `optimistic-file-${Date.now()}`,
      session_id: sessionId as string,
      sender_type: "admin",
      sender_id: admin.id || null,
      sender_name: admin.name || "Admin",
      message: file.name,
      created_at: new Date().toISOString(),
      seen_at: null,
      file_url: urlData.publicUrl,
      file_type: file.type,
    };
    setMessages((prev) => [...prev, optimisticFileMsg]);

    await fetch(`/api/admin/support/sessions/${sessionId}/file-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAdminHeaders() },
      body: JSON.stringify({
        fileName: file.name,
        fileUrl: urlData.publicUrl,
        fileType: file.type,
        senderName: admin.name,
      }),
    });

    setUploading(false);
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // AI suggested replies — fetch on new user message
  async function fetchSuggestions() {
    if (!messages.length) return;
    try {
      const res = await fetch("/api/support/ai-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messages.slice(-6).map((m) => ({
            role: m.sender_type,
            text: m.message,
          })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions || []);
      }
    } catch {}
  }

  // Fetch suggestions when a new user message arrives
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.sender_type === "user") {
      fetchSuggestions();
    }
  }, [messages.length]);

  async function handleTakeover(force = false) {
    const raw = localStorage.getItem("admin_session");
    if (!raw) return;

    const admin = JSON.parse(raw);
    setTaking(true);

    try {
      const res = await fetch(`/api/admin/support/sessions/${sessionId}/takeover`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAdminHeaders(),
        },
        body: JSON.stringify({ force, adminName: admin.name }),
      });

      if (!res.ok) {
        alert("Could not take over this session.");
        setTaking(false);
        return;
      }

      const data = await res.json();

      // Optimistic local update — don't wait for realtime
      setSession((prev) =>
        prev
          ? {
              ...prev,
              status: "active",
              assigned_admin_id: admin.id,
              assigned_admin_name: admin.name,
              updated_at: new Date().toISOString(),
            }
          : prev
      );
    } catch {
      alert("Could not take over this session.");
    } finally {
      setTaking(false);
    }
  }

  async function handleSendMessage() {
    if (!input.trim() || sending || !session) return;
    const text = input;
    setInput("");
    setSending(true);

    const raw = localStorage.getItem("admin_session");
    const admin = raw ? JSON.parse(raw) : { id: null, name: "Admin" };

    // Optimistic local update — show admin message immediately
    const optimisticMsg: ChatMessage = {
      id: `optimistic-${Date.now()}`,
      session_id: sessionId as string,
      sender_type: "admin",
      sender_id: admin.id || null,
      sender_name: admin.name || "Admin",
      message: text,
      created_at: new Date().toISOString(),
      seen_at: null,
      file_url: null,
      file_type: null,
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    // Clear typing indicator on send
    if (inputTypingRef.current) clearTimeout(inputTypingRef.current);
    fetch(`/api/admin/support/sessions/${sessionId}/typing`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAdminHeaders() },
      body: JSON.stringify({ typing: false }),
    }).catch(() => {});

    const res = await fetch("/api/support/message/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-id": admin.admin_id || "",
      },
      body: JSON.stringify({
        sessionId,
        senderType: "admin",
        adminId: admin.admin_id || admin.id,
        senderName: admin.name,
        message: text,
      }),
    });

    if (!res.ok) {
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
    }

    setSending(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }

  async function handleClose() {
    await fetch(`/api/admin/support/sessions/${sessionId}/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAdminHeaders() },
      body: JSON.stringify({
        messages: messages.map((m) => ({ sender_type: m.sender_type, message: m.message })),
      }),
    });

    router.push("/admin/support");
  }

  function adminPresence() {
    if (!session || !session.assigned_admin_id) return null;
    const diff = Date.now() - new Date(session.updated_at || session.created_at).getTime();
    const mins = diff / 60000;
    if (mins < 5) return { label: "Active now", dot: "🟢" };
    if (mins < 15) return { label: "Idle", dot: "🟡" };
    return { label: "Offline", dot: "⚪" };
  }

  async function handleReopen() {
    const raw = localStorage.getItem("admin_session");
    const admin = raw ? JSON.parse(raw) : null;

    const res = await fetch("/api/support/session/reopen", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-id": admin?.admin_id || "",
      },
      body: JSON.stringify({ sessionId, adminId: admin?.admin_id || admin?.id }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Failed to reopen session");
      return;
    }

    // Session will update via realtime subscription
  }

  async function handleTransfer(targetAdminId?: string) {
    if (!targetAdminId) return;

    const target = admins.find((a) => a.id === targetAdminId);
    const targetName = target?.display_name || target?.handle || undefined;

    setTransferring(true);
    setTransferOpen(false);
    const raw = localStorage.getItem("admin_session");
    const admin = raw ? JSON.parse(raw) : null;

    const res = await fetch("/api/support/session/transfer", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-id": admin?.admin_id || "",
      },
      body: JSON.stringify({
        sessionId,
        targetAdminId,
        targetAdminName: targetName,
      }),
    });

    setTransferring(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Failed to transfer");
      return;
    }

    const data = await res.json().catch(() => ({}));
    setTransferNotifId(data.notificationId || null);
    setTransferStatus("pending");
  }

  // 3-dot menu: send preloaded link to user
  async function sendLink(label: string, path: string) {
    const raw = localStorage.getItem("admin_session");
    const admin = raw ? JSON.parse(raw) : { id: null, name: "Admin" };
    const siteUrl = window.location.origin;
    const fullUrl = `${siteUrl}${path.startsWith("/") ? "" : "/"}${path}`;
    const text = `Here's a link for you — ${label}: ${fullUrl}`;

    // Optimistic local update
    const optimisticMsg: ChatMessage = {
      id: `optimistic-link-${Date.now()}`,
      session_id: sessionId as string,
      sender_type: "admin",
      sender_id: admin.id || null,
      sender_name: admin.name || "Admin",
      message: text,
      created_at: new Date().toISOString(),
      seen_at: null,
      file_url: null,
      file_type: null,
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setMenuOpen(false);

    const res = await fetch("/api/support/message/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-id": admin.admin_id || "",
      },
      body: JSON.stringify({
        sessionId,
        senderType: "admin",
        adminId: admin.admin_id || admin.id,
        senderName: admin.name,
        message: text,
      }),
    });

    if (!res.ok) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
    }
  }

  if (loading) {
    return (
      <div className="p-4 text-white/40 text-sm">Loading session…</div>
    );
  }

  if (!session) {
    return (
      <div className="p-4 text-red-400 text-sm">Session not found</div>
    );
  }

  const isAssigned = session.status === "active" && session.assigned_admin_id;

  // Check if the current admin is the one assigned to this session
  const rawAdmin = typeof window !== "undefined" ? localStorage.getItem("admin_session") : null;
  const currentAdmin = rawAdmin ? JSON.parse(rawAdmin) : null;
  const currentAdminId = currentAdmin?.id || null;
  const isOwner = isAssigned && currentAdminId && (session.assigned_admin_id === currentAdminId);
  const isReadOnly = isAssigned && !isOwner;

  const statusColor =
    session.status === "waiting"
      ? "text-yellow-400"
      : session.status === "active"
      ? "text-emerald-400"
      : "text-white/40";

  const presence = adminPresence();

  return (
    <div className="flex flex-col text-white" style={{ height: "calc(100vh - 120px)", minHeight: 400 }}>

      {/* ── HEADER ────────────────────────────────── */}
      <div className="px-3 py-2 md:px-4 md:py-3 border-b border-white/10 flex justify-between items-center bg-black/60 backdrop-blur-md shrink-0 relative z-20">
        <div>
          <button
            onClick={() => router.push("/admin/support")}
            className="text-xs text-white/40 hover:text-white/60 transition mb-1 block"
          >
            ← Back to Queue
          </button>
          <p className="text-sm font-medium">
            Session {String(sessionId).slice(0, 8)}…
          </p>
          <p className="text-xs text-white/50">
            {session.user_id ? (
              <button
                onClick={loadUserCard}
                className="text-emerald-400/80 hover:text-emerald-400 underline underline-offset-2 transition"
              >
                {cardOpen ? "Hide" : "View"} User: {session.user_id.slice(0, 12)}… {cardOpen ? "✕" : "↗"}
              </button>
            ) : "Anonymous user"}
            {session.assigned_admin_name && (
              <span className="ml-2">
                · {session.assigned_admin_name}
                {presence && <span className="ml-1">{presence.dot}</span>}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className={`text-xs font-medium ${statusColor}`}>
            {session.status === "active" ? "🟢 Active" : session.status === "waiting" ? "🟡 Waiting" : "⚪ Closed"}
          </span>

          {/* 3-DOT SMART MENU */}
          {isOwner && (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="text-lg px-2 py-1 hover:bg-white/10 rounded-lg transition"
              >
                ⋮
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-black border border-white/10 rounded-xl p-2 z-50 shadow-xl">
                  <MenuItem onClick={() => sendLink("Wallet", "/wallet")} label="📁 Send Wallet Link" />
                  <MenuItem onClick={() => sendLink("Onboarding", "/onboarding")} label="🚀 Send Onboarding" />
                  <MenuItem onClick={() => sendLink("Reset Password", "/reset-password")} label="🔑 Reset Password" />
                  <MenuItem onClick={() => sendLink("Transactions", "/transactions")} label="💳 View Transactions" />
                  <div className="border-t border-white/10 my-1" />
                  <MenuItem
                    onClick={() => { setMenuOpen(false); setTransferOpen(true); }}
                    label="🔀 Transfer Session"
                  />
                  <MenuItem
                    onClick={() => { setMenuOpen(false); handleClose(); }}
                    label="✕ Close Session"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── MAIN AREA: CHAT + OPTIONAL USER CARD ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Chat timeline */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
          {messages.length === 0 ? (
            <p className="text-white/30 text-sm text-center mt-[40%]">
              {session.last_message
                ? `Last message: "${session.last_message}"`
              : "Chat messages will appear here"}
          </p>
        ) : (
          messages.map((m, i) => {
            const prev = i > 0 ? messages[i - 1] : null;
            const isGrouped = !!prev && prev.sender_type === m.sender_type;
            // isLastAdmin: true only for the very last admin message in the list
            const isLastAdmin =
              m.sender_type === "admin" &&
              !messages.slice(i + 1).some((n) => n.sender_type === "admin");
            return (
              <MessageBubble
                key={m.id || i}
                msg={m}
                isGrouped={isGrouped}
                isLastAdmin={isLastAdmin}
              />
            );
          })
        )}

        {userTyping && (
          <div className="flex items-center gap-1 pl-1">
            <span className="text-xs text-emerald-400/60 italic">User is typing</span>
            <span className="flex gap-0.5">
              <span className="w-1.5 h-1.5 bg-emerald-400/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-emerald-400/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-emerald-400/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          </div>
        )}
        </div>

        {/* ── USER CARD PANEL ─────────────────────── */}
        {/* Mobile: full overlay | Desktop: side panel */}
        {cardOpen && (
          <>
            {/* Mobile backdrop */}
            <div
              className="fixed inset-0 bg-black/60 z-40 md:hidden"
              onClick={() => setCardOpen(false)}
            />
            <div className="
              fixed inset-x-0 bottom-0 top-16 z-50 bg-[#0a0a0a] overflow-y-auto
              md:static md:inset-auto md:z-auto md:w-72 md:border-l md:border-white/10 md:shrink-0 md:bg-white/[0.02]
            ">
              <div className="p-4 max-w-md mx-auto md:max-w-none">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">User Profile</h3>
                <button
                  onClick={() => setCardOpen(false)}
                  className="text-white/40 hover:text-white text-xs transition"
                >
                  ✕
                </button>
              </div>

              {cardLoading ? (
                <p className="text-xs text-white/40">Loading…</p>
              ) : !userCard?.profile ? (
                <p className="text-xs text-white/40">No profile found</p>
              ) : (
                <div className="space-y-4">
                  {/* Identity */}
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      {userCard.profile.display_name || userCard.profile.handle || "Unknown"}
                    </p>
                    {userCard.profile.handle && (
                      <p className="text-xs text-white/50">@{userCard.profile.handle}</p>
                    )}
                    {userCard.profile.email && (
                      <p className="text-xs text-white/40">{userCard.profile.email}</p>
                    )}
                  </div>

                  {/* Status badges */}
                  <div className="flex flex-wrap gap-1.5">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      userCard.profile.account_status === "active" ? "bg-emerald-500/15 text-emerald-400"
                      : userCard.profile.account_status === "restricted" ? "bg-yellow-500/15 text-yellow-400"
                      : userCard.profile.account_status === "suspended" ? "bg-red-500/15 text-red-400"
                      : "bg-white/10 text-white/50"
                    }`}>
                      {userCard.profile.account_status || "unknown"}
                    </span>
                    {userCard.profile.role && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400">
                        {userCard.profile.role}
                      </span>
                    )}
                    {userCard.profile.is_flagged && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">
                        🚩 Flagged
                      </span>
                    )}
                  </div>

                  {/* Wallet */}
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                    <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Wallet</p>
                    <p className="text-lg font-semibold">
                      ${userCard.wallet ? (userCard.wallet.balance / 100).toFixed(2) : "0.00"}
                    </p>
                    <p className="text-[10px] text-white/30 mt-0.5">{userCard.tipCount} tips received</p>
                  </div>

                  {/* Recent transactions */}
                  <div>
                    <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Recent Activity</p>
                    {userCard.transactions.length === 0 ? (
                      <p className="text-xs text-white/30">No transactions</p>
                    ) : (
                      <div className="space-y-1.5">
                        {userCard.transactions.map((tx) => (
                          <div key={tx.id} className="flex justify-between items-center text-xs">
                            <div>
                              <span className="text-white/70">{tx.type}</span>
                              <span className={`ml-1.5 ${
                                tx.status === "completed" ? "text-emerald-400/60"
                                : tx.status === "failed" ? "text-red-400/60"
                                : "text-white/30"
                              }`}>
                                {tx.status}
                              </span>
                            </div>
                            <span className="text-white/50 font-mono">
                              ${(tx.amount / 100).toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Joined */}
                  <p className="text-[10px] text-white/30">
                    Joined {new Date(userCard.profile.created_at).toLocaleDateString()}
                  </p>

                  {/* Support History */}
                  <div>
                    <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Support History</p>
                    {userCard.supportSessions.length === 0 ? (
                      <p className="text-xs text-white/30">No past sessions</p>
                    ) : (
                      <div className="space-y-1.5">
                        {userCard.supportSessions.map((ss) => (
                          <a
                            key={ss.id}
                            href={`/admin/support/${ss.id}`}
                            className="block p-2 rounded-lg bg-white/5 hover:bg-white/10 transition"
                          >
                            <div className="flex items-center justify-between">
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                                ss.status === "closed" ? "bg-white/10 text-white/40"
                                : ss.status === "active" ? "bg-emerald-500/15 text-emerald-400"
                                : "bg-yellow-500/15 text-yellow-400"
                              }`}>
                                {ss.status}
                              </span>
                              <span className="text-[10px] text-white/25">
                                {new Date(ss.closed_at || ss.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-xs text-white/50 mt-1 truncate">
                              {ss.last_message || "No messages"}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {ss.assigned_admin_name ? (
                                <span className="text-[10px] text-blue-400/50">{ss.assigned_admin_name}</span>
                              ) : (
                                <span className="text-[10px] text-white/25">AI only</span>
                              )}
                              {ss.closed_by && (
                                <span className="text-[10px] text-white/20">closed by {ss.closed_by}</span>
                              )}
                            </div>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Full profile link */}
                  <a
                    href={`/admin/users/${session.user_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-xs text-center text-blue-400 hover:text-blue-300 transition"
                  >
                    Open Full Profile ↗
                  </a>
                </div>
              )}
            </div>
          </div>
          </>
        )}
      </div>

      {/* ── READ-ONLY BANNER ─────────────────────── */}
      {isReadOnly && (
        <div className="px-4 py-2 bg-yellow-500/10 border-t border-yellow-500/20 text-yellow-400 text-xs text-center shrink-0 flex items-center justify-center gap-3">
          <span>Assigned to {session.assigned_admin_name || "another admin"} — view only</span>
          <button
            onClick={() => handleTakeover(true)}
            disabled={taking}
            className="bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 px-3 py-1 rounded-lg text-xs font-medium transition"
          >
            {taking ? "Taking over…" : "Force Take Over"}
          </button>
        </div>
      )}

      {/* ── AI SUGGESTIONS / QUICK ACTIONS ─────────── */}
      {isOwner && session.status !== "closed" && (
        <div className="px-4 pb-1 flex gap-2 overflow-x-auto shrink-0">
          {suggestions.length > 0 ? (
            suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => setInput(s)}
                className="text-xs px-3 py-1 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-300 rounded-full whitespace-nowrap transition active:scale-95 animate-[fadeIn_0.2s_ease]"
              >
                ✨ {s.length > 50 ? s.slice(0, 50) + "…" : s}
              </button>
            ))
          ) : (
            <>
              <QuickAction onClick={() => setInput("Please check your wallet and let me know.")} label="💰 Wallet Help" />
              <QuickAction onClick={() => setInput("Try reconnecting your account.")} label="🔄 Reconnect" />
              <QuickAction onClick={() => setInput("I'm reviewing your issue now — one moment please.")} label="⏳ Reviewing" />
              <QuickAction onClick={() => setInput("This has been resolved. Let me know if you need anything else!")} label="✅ Resolved" />
            </>
          )}
        </div>
      )}

      {/* ── INPUT BAR ─────────────────────────────── */}
      {isOwner && session.status !== "closed" && (
        <div className="p-3 md:p-4 border-t border-white/10 flex items-center gap-2 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf,.doc,.docx,.txt"
            className="hidden"
            onChange={handleFileUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="text-white/40 hover:text-white/70 text-lg transition active:scale-90 shrink-0"
            title="Attach file"
          >
            {uploading ? (
              <span className="animate-spin inline-block">⏳</span>
            ) : (
              "📎"
            )}
          </button>
          <input
            type="text"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/20 transition"
          />
          <button
            onClick={() => { handleSendMessage(); navigator.vibrate?.(10); }}
            disabled={sending || !input.trim()}
            className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-black px-4 py-2 rounded-xl text-sm font-medium transition active:scale-95"
          >
            Send
          </button>
        </div>
      )}

      {/* ── ACTION BAR ────────────────────────────── */}
      <div className="px-3 pb-3 md:px-4 md:pb-4 flex gap-2 md:gap-3 flex-wrap shrink-0">
        {session.status === "waiting" && (
          <button
            onClick={() => { handleTakeover(); navigator.vibrate?.(10); }}
            disabled={taking}
            className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-black px-4 py-2 rounded-xl text-sm font-medium transition active:scale-95"
          >
            {taking ? "Taking over…" : "Take Over Chat"}
          </button>
        )}

        {isOwner && (
          <>
            {/* Transfer status feedback */}
            {transferStatus === "pending" && (
              <div className="w-full flex items-center gap-2 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-300 animate-pulse">
                <span className="flex gap-0.5">
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
                Transfer request sent — waiting for response…
              </div>
            )}
            {transferStatus === "accepted" && (
              <div className="w-full px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-400 font-medium animate-[fadeIn_0.2s_ease]">
                ✓ Transfer accepted — redirecting…
              </div>
            )}
            {transferStatus === "declined" && (
              <div className="w-full px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 font-medium animate-[fadeIn_0.2s_ease]">
                <p>✗ Transfer declined</p>
                {declineReasonText && (
                  <p className="text-red-400/70 font-normal mt-0.5">Reason: {declineReasonText}</p>
                )}
              </div>
            )}

            {transferStatus === "idle" && (
              <div className="relative">
                <button
                  onClick={() => setTransferOpen((v) => !v)}
                  disabled={transferring}
                  className="bg-blue-500/20 hover:bg-blue-500/30 disabled:opacity-40 text-blue-400 px-4 py-2 rounded-xl text-sm font-medium transition active:scale-95"
                >
                  {transferring ? "Sending…" : "Transfer →"}
                </button>
                {transferOpen && (
                  <div className="absolute bottom-full mb-2 left-0 w-56 bg-black border border-white/10 rounded-xl p-2 z-50 shadow-xl">
                    {admins.filter((a) => a.id !== session.assigned_admin_id).length === 0 ? (
                      <p className="text-xs text-white/40 px-3 py-2">No other admins available</p>
                    ) : (
                      admins
                        .filter((a) => a.id !== session.assigned_admin_id)
                        .map((a) => (
                          <button
                            key={a.id}
                            onClick={() => handleTransfer(a.id)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-white/10 rounded-lg transition"
                          >
                            {a.display_name || a.handle || a.id.slice(0, 8)}
                          </button>
                        ))
                    )}
                  </div>
                )}
              </div>
            )}
            <button
              onClick={handleClose}
              className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl text-sm transition active:scale-95"
            >
              Close Session
            </button>
          </>
        )}

        {session.status === "closed" && (
          <>
            <p className="text-white/40 text-sm self-center">Session closed</p>
            {session.closed_at && (Date.now() - new Date(session.closed_at).getTime()) < 10 * 60 * 1000 && (
              <button
                onClick={handleReopen}
                className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 px-4 py-2 rounded-xl text-sm font-medium transition"
              >
                Reopen Session
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
