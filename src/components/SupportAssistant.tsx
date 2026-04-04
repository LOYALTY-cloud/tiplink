"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getSupportReply } from "@/lib/supportEngine";
import { getInitials } from "@/lib/getInitials";

type Action = { label: string; href: string };
type Feedback = "none" | "pending" | "yes" | "no";
type Message = { role: "user" | "bot" | "agent" | "system"; text: string; actions?: Action[]; feedback?: Feedback; source?: "ai" | "human"; agentId?: string; agentName?: string; adminId?: string; timestamp?: string; file_url?: string | null; file_type?: string | null };

const defaultMessage: Message = { role: "bot", text: "Hi! I'm your support assistant. Ask me anything about tips, payouts, fees, or your account." };

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
            className={className || "underline text-blue-400 break-all"}
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

/** Small component that fades in after a delay */
function FadeIn({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), delay); return () => clearTimeout(t); }, [delay]);
  return (
    <div
      className="transition-all duration-300 ease-out"
      style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(6px)" }}
    >
      {children}
    </div>
  );
}

export default function SupportAssistant() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([defaultMessage]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [failCount, setFailCount] = useState(0);
  const [mode, setMode] = useState<"assistant" | "agent">("assistant");
  const [isConnecting, setIsConnecting] = useState(false);
  const [agentTyping, setAgentTyping] = useState(false);
  const [lastIssue, setLastIssue] = useState<string | null>(null);
  const [agentMessageCount, setAgentMessageCount] = useState(0);
  const [showClosing, setShowClosing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [agentName, setAgentName] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "reconnecting" | "disconnected">("connected");
  const [seenByAdmin, setSeenByAdmin] = useState(false);
  const [sessionMode, setSessionMode] = useState<"human" | "ai">("human");
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [convertingToTicket, setConvertingToTicket] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [sessionClosed, setSessionClosed] = useState(false);
  const [inactivityWarning, setInactivityWarning] = useState(false);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved chat + mode + session + agent
  useEffect(() => {
    // Fetch user display name for avatar initials
    supabase.auth.getSession().then(({ data: sessionData }) => {
      const uid = sessionData.session?.user?.id;
      if (uid) {
        supabase.from("profiles").select("display_name").eq("user_id", uid).maybeSingle().then(({ data }) => {
          if (data?.display_name) setUserName(data.display_name);
        });
      }
    });

    const saved = localStorage.getItem("support_chat");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) { setMessages(parsed); }
        else {
          if (parsed.messages) setMessages(parsed.messages);
          if (parsed.sessionId) setSessionId(parsed.sessionId);
          if (parsed.agent) {
            setAgentName(parsed.agent.name);
            setAgentId(parsed.agent.id);
            setMode("agent");
          }
        }
      } catch { localStorage.removeItem("support_chat"); }
    }
    const savedAgent = localStorage.getItem("support_agent");
    if (savedAgent && saved) {
      // Only restore agent mode if we also have a saved chat with messages
      // (i.e. an active live session, not a stale leftover)
      try {
        const agent = JSON.parse(savedAgent);
        const parsed = JSON.parse(saved);
        const hasAgentMessages = Array.isArray(parsed?.messages) && parsed.messages.some((m: Message) => m.role === "agent");
        if (hasAgentMessages) {
          setAgentName(agent.name);
          setAgentId(agent.id);
          setMode("agent");
        } else {
          // Stale agent data from a previous closed session
          localStorage.removeItem("support_agent");
        }
      } catch { localStorage.removeItem("support_agent"); }
    } else if (savedAgent) {
      // No saved chat but agent exists — stale, remove it
      localStorage.removeItem("support_agent");
    }
    let sid = localStorage.getItem("support_session_id");
    if (!sid) { sid = crypto.randomUUID(); localStorage.setItem("support_session_id", sid); }
    setSessionId(sid);

    // Create support session in DB so it appears in admin queue
    supabase.auth.getSession().then(({ data: sessionData }) => {
      const token = sessionData.session?.access_token;
      fetch("/api/support/session/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ sessionId: sid }),
      })
        .then((r) => r.json())
        .then((data) => {
          // If server issued a new session (old one was closed), update locally
          if (data.newSessionId) {
            localStorage.setItem("support_session_id", data.newSessionId);
            localStorage.removeItem("support_chat");
            setSessionId(data.newSessionId);
            setMessages([]);
          }
          // Always start in AI assistant mode — the bot handles first contact
          setSessionMode("ai");
          if (data.assigned) {
            // Existing session already has an admin — switch to live mode
            setSessionMode("human");
          }
        })
        .catch(() => {});
    });
  }, []);

  // Persist chat + mode + agent
  useEffect(() => {
    if (messages.length <= 1) return;
    localStorage.setItem("support_chat", JSON.stringify({
      sessionId,
      messages,
      agent: agentName ? { id: agentId, name: agentName } : null,
    }));
  }, [messages, sessionId, agentName, agentId]);

  useEffect(() => {
    localStorage.setItem("support_mode", mode);
  }, [mode]);

  // Subscribe to session updates for admin takeover
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
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
          const updated = payload.new as { status: string; assigned_admin_id: string; assigned_admin_name: string; mode?: string };
          // Mode upgrade: AI session got an admin assigned
          if (updated.mode === "human" && sessionMode === "ai" && updated.assigned_admin_id) {
            setSessionMode("human");
            startLiveSupport({
              id: updated.assigned_admin_id,
              name: updated.assigned_admin_name || "Support Agent",
            });
            setShowUpgradePrompt(false);
          } else if (updated.status === "active" && updated.assigned_admin_id && mode !== "agent") {
            startLiveSupport({
              id: updated.assigned_admin_id,
              name: updated.assigned_admin_name || "Support Agent",
            });
          }
          if (updated.status === "closed" && mode === "agent") {
            setMessages((prev) => [...prev, { role: "system", text: "Session closed by support agent." }]);
            setMode("assistant");
            setAgentName(null);
            setAgentId(null);
            localStorage.removeItem("support_agent");
            setSessionClosed(true);
          } else if (updated.status === "closed") {
            // Session closed by system (inactivity) or admin while in AI mode
            setSessionClosed(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, mode]);

  // Listen for admin availability changes — offer upgrade when in AI mode
  useEffect(() => {
    if (!sessionId || sessionMode !== "ai") return;

    const channel = supabase
      .channel(`admin-availability-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
        },
        (payload) => {
          const updated = payload.new as { role?: string; availability?: string };
          const adminRoles = ["owner", "super_admin", "finance_admin", "support_admin"];
          if (updated.role && adminRoles.includes(updated.role) && updated.availability === "online") {
            // An admin just came online — show upgrade prompt
            setShowUpgradePrompt(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, sessionMode]);

  // Subscribe to typing indicators
  useEffect(() => {
    if (!sessionId || mode !== "agent") return;

    const channel = supabase
      .channel(`support-typing-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "support_typing",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as { admin_typing?: boolean };
          setAgentTyping(!!row.admin_typing);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnectionStatus("connected");
        else if (status === "CHANNEL_ERROR") setConnectionStatus("reconnecting");
        else if (status === "CLOSED") setConnectionStatus("disconnected");
      });

    return () => { supabase.removeChannel(channel); };
  }, [sessionId, mode]);

  // Subscribe to incoming admin messages (realtime)
  useEffect(() => {
    if (!sessionId || mode !== "agent") return;

    const channel = supabase
      .channel(`support-user-messages-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const msg = payload.new as { sender_type: string; sender_name: string; sender_id: string; message: string; file_url?: string; file_type?: string };
          if (msg.sender_type === "admin") {
            setAgentTyping(false);
            setMessages((prev) => [
              ...prev,
              {
                role: "agent",
                text: msg.message,
                agentId: msg.sender_id,
                agentName: msg.sender_name || agentName || "Agent",
                source: "human",
                timestamp: new Date().toISOString(),
                file_url: msg.file_url || null,
                file_type: msg.file_type || null,
              },
            ]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, mode, agentName]);

  // Subscribe to seen_at updates (admin read receipts)
  useEffect(() => {
    if (!sessionId || mode !== "agent") return;

    const channel = supabase
      .channel(`support-seen-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "support_messages",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as { sender_type: string; seen_at: string | null };
          if (row.sender_type === "user" && row.seen_at) {
            setSeenByAdmin(true);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sessionId, mode]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Inactivity auto-close: warn at 13 min, close at 15 min
  const INACTIVITY_WARNING_MS = 13 * 60 * 1000;
  const INACTIVITY_CLOSE_MS = 15 * 60 * 1000;

  function resetInactivityTimer() {
    setInactivityWarning(false);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);

    warningTimerRef.current = setTimeout(() => {
      if (!sessionClosed) setInactivityWarning(true);
    }, INACTIVITY_WARNING_MS);

    inactivityTimerRef.current = setTimeout(() => {
      if (!sessionClosed) {
        setSessionClosed(true);
        setMessages((prev) => [...prev, { role: "system", text: "This conversation was automatically closed due to inactivity." }]);
        // Close in DB
        if (sessionId) {
          const now = new Date().toISOString();
          supabase
            .from("support_sessions")
            .update({ status: "closed", closed_by: "system", closed_at: now, updated_at: now })
            .eq("id", sessionId)
            .in("status", ["waiting", "active"])
            .then(() => {}, () => {});
        }
      }
    }, INACTIVITY_CLOSE_MS);
  }

  // Reset timer on every new message
  useEffect(() => {
    if (sessionClosed || messages.length <= 1) return;
    resetInactivityTimer();
    return () => {
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [messages.length, sessionClosed]);

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function convertToTicket() {
    if (!sessionId || convertingToTicket) return;
    setConvertingToTicket(true);
    setMenuOpen(false);

    const { data: authSess } = await supabase.auth.getSession();
    const token = authSess.session?.access_token;
    if (!token) {
      setMessages((prev) => [...prev, { role: "system", text: "Please sign in to create a ticket." }]);
      setConvertingToTicket(false);
      return;
    }

    try {
      const res = await fetch("/api/support/tickets/from-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId, subject: lastIssue || "Support conversation" }),
      });
      const data = await res.json();
      if (res.ok && data.ticket) {
        setMessages((prev) => [
          ...prev,
          { role: "system", text: `📋 Ticket created (#${data.ticket.id.slice(0, 8)}). You can track it in Help & Support → Tickets.` },
        ]);
      } else {
        setMessages((prev) => [...prev, { role: "system", text: data.error || "Failed to create ticket." }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "system", text: "Network error. Please try again." }]);
    }
    setConvertingToTicket(false);
  }

  function handleEndChat() {
    // Close session in DB with closed_at (double-close guard: only if not already closed)
    if (sessionId) {
      const now = new Date().toISOString();
      supabase
        .from("support_sessions")
        .update({ status: "closed", closed_by: "user", closed_at: now, updated_at: now })
        .eq("id", sessionId)
        .in("status", ["waiting", "active"])
        .then(() => {}, () => {});
    }

    // Clear history cache so it reloads next time with the newly closed session

    setMessages([defaultMessage]);
    setMenuOpen(false);
    setInput("");
    setLoading(false);
    setFailCount(0);
    setMode("assistant");
    setIsConnecting(false);
    setAgentTyping(false);
    setLastIssue(null);
    setAgentMessageCount(0);
    setShowClosing(false);
    setAgentName(null);
    setAgentId(null);
    localStorage.removeItem("support_chat");
    localStorage.removeItem("support_mode");
    localStorage.removeItem("support_session_id");
    localStorage.removeItem("support_agent");
    const newSid = crypto.randomUUID();
    localStorage.setItem("support_session_id", newSid);
    setSessionId(newSid);
    setSessionClosed(false);
    setInactivityWarning(false);
  }

  function startNewChat() {
    handleEndChat();
    // The new session will be created by the initial useEffect when sessionId changes
  }

  const handleFeedback = useCallback((idx: number, vote: "yes" | "no") => {
    setMessages((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], feedback: vote };
      return updated;
    });

    if (vote === "yes") {
      // Append confirmation after short delay
      setTimeout(() => {
        setMessages((prev) => [...prev, { role: "bot", text: "Glad I could help 👍" }]);
        setFailCount(0);
      }, 400);
    } else {
      // Escalation tree
      const nextFail = failCount + 1;
      setFailCount(nextFail);
      setTimeout(() => {
        if (nextFail === 1) {
          setMessages((prev) => [
            ...prev,
            {
              role: "bot",
              text: "Got it — let me try another way. Here are some options that might help:",
              actions: [
                { label: "Go to Wallet", href: "/dashboard/wallet" },
                { label: "View Transactions", href: "/dashboard/transactions" },
                { label: "Enable payouts", href: "/dashboard/onboarding" },
              ],
              feedback: "pending",
            },
          ]);
        } else if (nextFail === 2) {
          setMessages((prev) => [
            ...prev,
            {
              role: "bot",
              text: "Still having trouble? Let's get you to the right place:",
              actions: [
                { label: "Go to Settings", href: "/dashboard/settings" },
                { label: "Edit Profile", href: "/dashboard/profile" },
              ],
              feedback: "pending",
            },
          ]);
        } else {
          if (sessionMode === "ai") {
            setMessages((prev) => [
              ...prev,
              {
                role: "bot",
                text: "Live support is currently unavailable. I'll keep helping you, and an agent will join when one comes online.",
                actions: [
                  { label: "Leave a message for later", href: "__leave_message__" },
                ],
              },
            ]);
          } else {
            setMessages((prev) => [
              ...prev,
              {
                role: "bot",
                text: "This might need a deeper look — I can connect you to live support.",
                actions: [
                  { label: "Contact live support", href: "__connect_live__" },
                ],
              },
            ]);
          }
        }
      }, 400);
    }
  }, [failCount]);

  function handleAction(action: Action) {
    if (action.href === "__connect_live__") {
      startLiveSupport();
      return;
    }
    if (action.href === "__leave_message__") {
      setMessages((prev) => [
        ...prev,
        { role: "system", text: "Your conversation has been saved. An agent will review it when they come online." },
      ]);
      return;
    }
    router.push(action.href);
  }

  function getAgentGreeting(issue?: string | null, name?: string | null) {
    const n = name || "Angel";
    if (!issue) return `Hi, I'm ${n} — I'm here to help. What's going on?`;
    const l = issue.toLowerCase();
    if (l.includes("withdraw") || l.includes("payout") || l.includes("cash out"))
      return `Hi, I'm ${n} — I see you're having trouble withdrawing. Let's fix that.`;
    if (l.includes("payment") || l.includes("tip") || l.includes("charge"))
      return `Hi, I'm ${n} — looks like this is about a payment. I'll help you sort it out.`;
    if (l.includes("balance") || l.includes("money") || l.includes("wallet"))
      return `Hi, I'm ${n} — I see there's a question about your balance. Let me take a look.`;
    return `Hi, I'm ${n} — I saw your issue. Let's work through it together.`;
  }

  function getAgentThinkingText() {
    const n = agentName || "Angel";
    const options = [`${n} is typing...`, `${n} is reviewing your issue...`, `${n} is checking that...`, `${n} is looking into it...`];
    return options[Math.floor(Math.random() * options.length)];
  }

  function getAgentReply(userInput: string): { text: string; actions?: Action[] } {
    const l = userInput.toLowerCase();
    if (l.includes("withdraw") || l.includes("payout"))
      return { text: "Got it — what happens when you tap withdraw? Do you see any message?", actions: [{ label: "Go to Wallet", href: "/dashboard/wallet" }] };
    if (l.includes("balance") || l.includes("money"))
      return { text: "Let me check — can you confirm what amount you're seeing?", actions: [{ label: "Go to Wallet", href: "/dashboard/wallet" }] };
    if (l.includes("profile") || l.includes("name") || l.includes("handle"))
      return { text: "Sure — you can update that from your profile page. Is something not saving?", actions: [{ label: "Edit Profile", href: "/dashboard/profile" }] };
    const replies = [
      "Got it — can you tell me exactly what happens when you try?",
      "Okay, let's take a look. Are you seeing any error message?",
      "I can help with that — what are you seeing on your screen?",
      "Let's fix this step by step. What's showing up for you?",
    ];
    return { text: replies[Math.floor(Math.random() * replies.length)] };
  }

  async function upgradeToHuman() {
    if (!sessionId) return;
    setShowUpgradePrompt(false);
    setMessages((prev) => [...prev, { role: "system", text: "Connecting you to live support..." }]);

    const { data: authSess } = await supabase.auth.getSession();
    const token = authSess.session?.access_token;
    const res = await fetch("/api/support/session/upgrade", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ sessionId }),
    }).then((r) => r.json()).catch(() => ({ ok: false }));

    if (res.assigned) {
      // The realtime subscription will handle startLiveSupport
      setSessionMode("human");
    } else {
      setMessages((prev) => [...prev, { role: "system", text: "No agents available right now. The AI assistant will keep helping you." }]);
    }
  }

  function startLiveSupport(admin?: { id: string; name: string; admin_id?: string }) {
    setIsConnecting(true);
    setMessages((prev) => [...prev, { role: "system", text: "Connecting you to live support..." }]);

    setTimeout(() => {
      const agent = admin || { id: "temp-admin-id", name: "Support Agent" };
      setIsConnecting(false);
      setMode("agent");
      setAgentName(agent.name);
      setAgentId(agent.id);
      localStorage.setItem("support_agent", JSON.stringify(agent));

      setMessages((prev) => [
        ...prev,
        { role: "system", text: `${agent.name} joined the chat` },
        { role: "agent", text: getAgentGreeting(lastIssue, agent.name), agentId: agent.id, agentName: agent.name, adminId: agent.admin_id, source: "human" },
      ]);
    }, 2500);
  }

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const text = input;
    setInput("");

    // Agent mode — send real messages to DB
    if (mode === "agent") {
      setSeenByAdmin(false);
      setMessages((prev) => [...prev, { role: "user", text, source: "human", timestamp: new Date().toISOString() }]);
      setLoading(true);

      // Persist user message to support_messages (authenticated)
      const { data: authSession } = await supabase.auth.getSession();
      const authToken = authSession.session?.access_token;
      fetch("/api/support/message/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          sessionId,
          senderType: "user",
          message: text,
        }),
      }).catch(() => {});

      // Clear typing indicator on send
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      supabase.from("support_typing").upsert({
        session_id: sessionId,
        user_typing: false,
        updated_at: new Date().toISOString(),
      }).then(() => {}, () => {});

      setLoading(false);
      return;
    }

    // Track last issue for context handoff
    setLastIssue(text);
    setMessages((prev) => [...prev, { role: "user", text, source: "human", timestamp: new Date().toISOString() }]);
    setLoading(true);

    // Persist user message to support_messages (authenticated)
    if (sessionId) {
      const { data: authSess } = await supabase.auth.getSession();
      const authTok = authSess.session?.access_token;
      fetch("/api/support/message/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authTok ? { Authorization: `Bearer ${authTok}` } : {}),
        },
        body: JSON.stringify({
          sessionId,
          senderType: "user",
          message: text,
        }),
      }).catch(() => {});
    }

    // Update last_message in support session
    if (sessionId) {
      supabase
        .from("support_sessions")
        .update({ last_message: text, updated_at: new Date().toISOString() })
        .eq("id", sessionId)
        .then(() => {}, () => {});
    }

    // Show typing indicator
    setMessages((prev) => [...prev, { role: "bot", text: "Thinking…" }]);

    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;

      if (!token) {
        setMessages((prev) => [...prev.slice(0, -1), { role: "bot", text: getSupportReply(text), feedback: "pending", source: "ai" }]);
        return;
      }

      const res = await fetch("/api/support/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: text,
          sessionId,
          failCount,
          messageCount: messages.filter((m) => m.role === "user").length,
        }),
      });

      const json = await res.json();
      const actions: Action[] = json.actions ?? (json.action ? [json.action] : undefined);
      // Replace typing indicator with real response
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: "bot", text: json.reply ?? "Something went wrong. Please try again.", actions, feedback: "pending", source: "ai" },
      ]);

      // Handle escalation from server
      if (json.escalation?.triggered) {
        if (json.escalation.adminAssigned) {
          setMessages((prev) => [
            ...prev,
            { role: "system", text: `⚠️ Escalating your issue — ${json.escalation.adminName || "a support agent"} is joining now.` },
          ]);
          setSessionMode("human");
        } else {
          setMessages((prev) => [
            ...prev,
            { role: "system", text: "⚠️ Your issue has been flagged for priority support. An agent will join as soon as one is available." },
          ]);
        }
        setFailCount(0);
      }
    } catch {
      setMessages((prev) => [...prev.slice(0, -1), { role: "bot", text: getSupportReply(text), feedback: "pending", source: "ai" }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 md:p-5 flex flex-col" style={{ height: "calc(100vh - 160px)", minHeight: 400 }}>
      <div ref={menuRef} className="flex items-center justify-between mb-3 relative">
        <h3 className="text-white font-semibold">
          {mode === "agent" ? (
            <>
              {connectionStatus === "connected" ? "🟢" : connectionStatus === "reconnecting" ? "🟡" : "🔴"}{" "}
              Live Support • {agentName || "Agent"}
              {connectionStatus !== "connected" && (
                <span className="text-xs text-white/40 ml-2 font-normal">
                  {connectionStatus === "reconnecting" ? "Reconnecting…" : "Disconnected"}
                </span>
              )}
            </>
          ) : "Support Assistant"}
        </h3>
        <button onClick={() => setMenuOpen((v) => !v)} className="text-white/60 hover:text-white text-lg px-2">⋮</button>
        {menuOpen && (
          <div className="absolute right-0 top-8 bg-black border border-white/10 rounded-lg shadow-lg z-50 min-w-[180px]">
            <button onClick={convertToTicket} disabled={convertingToTicket} className="w-full text-left px-4 py-2 text-sm text-white/70 hover:bg-white/10 rounded-t-lg disabled:opacity-40">
              {convertingToTicket ? "Creating…" : "📋 Convert to Ticket"}
            </button>
            <button onClick={handleEndChat} className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-white/10 rounded-b-lg">
              End Chat
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2 mb-3 pr-1">
        {messages.map((m, i) => {
          const prevMsg = i > 0 ? messages[i - 1] : null;
          const isGrouped = prevMsg && prevMsg.role === m.role && m.role !== "system";
          // Show timestamp if first in group, or every 5 minutes
          const showTimestamp = m.timestamp && (!isGrouped || (prevMsg?.timestamp && new Date(m.timestamp).getTime() - new Date(prevMsg.timestamp).getTime() > 5 * 60 * 1000));

          const isBot = m.role === "bot";
          const isAgent = m.role === "agent";
          const isUser = m.role === "user";

          const displayName = isBot
            ? "Support Assistant"
            : isAgent
            ? m.agentName || agentName || "Agent"
            : userName || "You";

          const initials = isBot ? "SA" : getInitials(displayName);

          const avatarColor = isBot
            ? "bg-emerald-500"
            : isAgent
            ? "bg-blue-500"
            : "bg-gray-500";

          return (
          <div key={i} className={isGrouped ? "space-y-0.5" : "space-y-2"}>
            {/* System messages */}
            {m.role === "system" ? (
              <div className="text-center py-1">
                <span className="text-white/30 text-xs italic">
                  {m.text}
                  {isConnecting && m.text.includes("Connecting") && (
                    <span className="ml-1 animate-pulse">●●●</span>
                  )}
                </span>
              </div>
            ) : (
              <div className={`flex ${isUser ? "justify-end" : "justify-start"} animate-[fadeIn_0.2s_ease]`}>
                <div className="flex items-start gap-2.5 max-w-[85%]">

                  {/* Avatar LEFT for bot/agent */}
                  {!isUser && (
                    isGrouped ? (
                      <div className="w-8 shrink-0" />
                    ) : (
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0 ${avatarColor}`}>
                        {initials}
                      </div>
                    )
                  )}

                  {/* Message content */}
                  <div className="min-w-0">
                    {/* Name label */}
                    {!isUser && !isGrouped && (
                      <div className="text-xs text-white/50 mb-1">
                        {displayName}
                      </div>
                    )}
                    {isUser && !isGrouped && (
                      <div className="text-xs text-white/40 mb-1 text-right">
                        You
                      </div>
                    )}

                    <div
                      className={`p-3 text-sm leading-relaxed ${
                        isUser
                          ? "bg-emerald-500/20 text-white"
                          : isAgent
                          ? "bg-white/5 border border-white/10 text-white"
                          : "bg-white/5 border border-white/10 text-white"
                      } ${isGrouped
                          ? isUser ? "rounded-xl rounded-tr-sm" : "rounded-xl rounded-tl-sm"
                          : isUser ? "rounded-xl rounded-br-sm" : "rounded-xl rounded-bl-sm"
                      }`}
                    >
                      {m.file_url ? (
                        m.file_type?.startsWith("image/") ? (
                          <a href={m.file_url} target="_blank" rel="noopener noreferrer">
                            <img src={m.file_url} alt={m.text} className="max-w-[240px] rounded-lg mb-1" />
                          </a>
                        ) : (
                          <a href={m.file_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline text-xs">
                            📎 {m.text || "View attachment"}
                          </a>
                        )
                      ) : (
                        <Linkify text={m.text} className={isUser ? "underline text-white break-all" : "underline text-blue-400 break-all"} />
                      )}
                      {showTimestamp && (
                        <div className={`text-[10px] mt-1 ${isUser ? "text-white/30 text-right" : "text-white/25"}`}>
                          {new Date(m.timestamp!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      )}
                      {m.actions && m.actions.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {m.actions.map((a, j) => (
                            <button
                              key={j}
                              onClick={() => handleAction(a)}
                              className="text-emerald-400 text-xs font-medium hover:text-emerald-300 transition"
                            >
                              → {a.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Avatar RIGHT for user */}
                  {isUser && (
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
            )}

            {/* Seen indicator for last user message in agent mode */}
            {mode === "agent" && m.role === "user" && !messages.slice(i + 1).some((n) => n.role === "user") && (
              <p className="text-[10px] text-white/30 text-right pr-1 mt-0.5">
                {seenByAdmin ? "Seen" : "Delivered"}
              </p>
            )}

            {/* Follow-up feedback (only in assistant mode) */}
            {mode === "assistant" && m.feedback === "pending" && (
              <FadeIn delay={1200}>
                <div className="max-w-[85%] mr-auto flex items-center gap-3 pl-10">
                  <span className="text-white/40 text-xs">Did this help?</span>
                  <button
                    onClick={() => handleFeedback(i, "yes")}
                    className="text-white/40 hover:text-emerald-400 text-sm transition"
                  >
                    👍
                  </button>
                  <button
                    onClick={() => handleFeedback(i, "no")}
                    className="text-white/40 hover:text-red-400 text-sm transition"
                  >
                    👎
                  </button>
                </div>
              </FadeIn>
            )}
            {m.feedback === "yes" && (
              <div className="max-w-[85%] mr-auto pl-10">
                <span className="text-emerald-400/60 text-xs">👍 Helpful</span>
              </div>
            )}
            {m.feedback === "no" && (
              <div className="max-w-[85%] mr-auto pl-10">
                <span className="text-red-400/60 text-xs">👎 Not helpful</span>
              </div>
            )}
          </div>
          );
        })}

        {/* Agent typing indicator */}
        {agentTyping && (
          <div className="flex items-center gap-1 pl-1">
            <span className="text-xs text-blue-400/60 italic">{agentName || 'Agent'} is typing</span>
            <span className="flex gap-0.5">
              <span className="w-1.5 h-1.5 bg-blue-400/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-blue-400/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-blue-400/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          </div>
        )}
      </div>

      {/* Soft closing after 3 agent messages */}
      {mode === "agent" && showClosing && (
        <div className="mb-2 bg-blue-500/5 border border-blue-500/10 rounded-xl p-3">
          <p className="text-white/70 text-sm mb-2">That should fix it — anything else?</p>
          <div className="flex gap-2">
            <button onClick={handleEndChat} className="text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 px-3 py-1.5 rounded-lg transition">
              👍 All good
            </button>
            <button onClick={() => { setShowClosing(false); setAgentMessageCount(0); }} className="text-xs bg-white/5 text-white/60 hover:bg-white/10 px-3 py-1.5 rounded-lg transition">
              💬 Ask something else
            </button>
          </div>
        </div>
      )}

      {/* End session button (agent mode only) */}
      {mode === "agent" && !showClosing && (
        <div className="mb-2">
          <button onClick={handleEndChat} className="text-xs text-red-400/70 hover:text-red-300 transition">
            End support session
          </button>
        </div>
      )}

      {/* Live support upgrade prompt (AI mode → human available) */}
      {showUpgradePrompt && sessionMode === "ai" && mode !== "agent" && !sessionClosed && (
        <div className="mb-2 bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3">
          <p className="text-white/70 text-sm mb-2">🟢 Live support is now available</p>
          <div className="flex gap-2">
            <button
              onClick={upgradeToHuman}
              className="text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 px-3 py-1.5 rounded-lg transition"
            >
              Connect to Support
            </button>
            <button
              onClick={() => setShowUpgradePrompt(false)}
              className="text-xs bg-white/5 text-white/60 hover:bg-white/10 px-3 py-1.5 rounded-lg transition"
            >
              Continue with AI
            </button>
          </div>
        </div>
      )}

      {/* Inactivity warning — 2 min before auto-close */}
      {inactivityWarning && !sessionClosed && (
        <div className="mb-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 animate-[fadeIn_0.3s_ease]">
          <p className="text-yellow-400 text-sm">Chat will close in 2 minutes due to inactivity.</p>
          <button
            onClick={() => { resetInactivityTimer(); setInactivityWarning(false); }}
            className="text-xs bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30 px-3 py-1.5 rounded-lg transition mt-2"
          >
            I'm still here
          </button>
        </div>
      )}

      {/* Session closed — prompt to start new chat */}
      {sessionClosed ? (
        <div className="text-center py-4 space-y-3">
          <p className="text-white/40 text-xs">This conversation has ended.</p>
          <button
            onClick={startNewChat}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition active:scale-95"
          >
            Start New Chat
          </button>
        </div>
      ) : (
      /* Input */
      <div className="flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf,.doc,.docx,.txt"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file || !sessionId) return;
            if (file.size > 10 * 1024 * 1024) { alert("File must be under 10MB"); return; }
            setUploading(true);
            const filePath = `${sessionId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
            const { error: uploadErr } = await supabase.storage.from("support-files").upload(filePath, file);
            if (uploadErr) { setUploading(false); alert("Upload failed: " + uploadErr.message); return; }
            const { data: urlData } = supabase.storage.from("support-files").getPublicUrl(filePath);
            const { data: authSess } = await supabase.auth.getSession();
            const authTok = authSess.session?.access_token;
            await fetch("/api/support/message/send", {
              method: "POST",
              headers: { "Content-Type": "application/json", ...(authTok ? { Authorization: `Bearer ${authTok}` } : {}) },
              body: JSON.stringify({ sessionId, senderType: "user", message: file.name, file_url: urlData.publicUrl, file_type: file.type }),
            });
            setMessages((prev) => [...prev, { role: "user", text: file.name, file_url: urlData.publicUrl, file_type: file.type, source: "human", timestamp: new Date().toISOString() }]);
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
        />
        {mode === "agent" && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="text-white/40 hover:text-white/70 text-lg transition active:scale-90 shrink-0 self-center"
            title="Attach file"
          >
            {uploading ? <span className="animate-spin inline-block">⏳</span> : "📎"}
          </button>
        )}
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            // Fire user_typing indicator on keystroke (agent mode only)
            if (mode === "agent" && sessionId) {
              supabase.from("support_typing").upsert({
                session_id: sessionId,
                user_typing: true,
                updated_at: new Date().toISOString(),
              }).then(() => {}, () => {});
              if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
              typingTimeoutRef.current = setTimeout(() => {
                supabase.from("support_typing").upsert({
                  session_id: sessionId,
                  user_typing: false,
                  updated_at: new Date().toISOString(),
                }).then(() => {}, () => {});
              }, 1200);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder="Ask something..."
          className="flex-1 px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder:text-white/30 outline-none focus:border-white/20 transition"
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || loading}
          className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 rounded-xl text-sm font-medium text-white transition active:scale-95"
        >
          {loading ? "…" : "Send"}
        </button>
      </div>
      )}
    </div>
  );
}
