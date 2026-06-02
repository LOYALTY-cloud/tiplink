"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { OverlayPortal } from "@/components/OverlayPortal";
import { AnimatePresence, motion } from "framer-motion";

interface Notification {
  id: string;
  type: string;
  category: string;
  actor_id: string | null;
  entity_id: string | null;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [bellBounce, setBellBounce] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "payouts" | "sales">("all");
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const apiFetch = useCallback(async (path: string, opts?: RequestInit) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const res = await fetch(path, {
      ...opts,
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json", ...opts?.headers },
    });
    if (!res.ok) return null;
    return res.json();
  }, []);

  const load = useCallback(async () => {
    const data = await apiFetch("/api/notifications");
    if (data) {
      setItems(data.notifications ?? []);
      setUnread(data.unread ?? 0);
    }
  }, [apiFetch]);

  // Initial fetch
  useEffect(() => { load(); }, [load]);

  // Realtime subscription for new notifications
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      channel = supabase
        .channel("notifications-bell")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
          (payload) => {
            const n = payload.new as Notification;
            setItems((prev) => [n, ...prev].slice(0, 30));
            setUnread((prev) => prev + 1);
            // Haptic + bell bounce on new notification
            navigator.vibrate?.(15);
            setBellBounce(true);
            setTimeout(() => setBellBounce(false), 500);
            // Fire toast popup
            window.dispatchEvent(
              new CustomEvent("new-notification", { detail: n })
            );
          },
        )
        .subscribe();
    })();

    return () => { if (channel) supabase.removeChannel(channel); };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        ref.current && !ref.current.contains(target) &&
        panelRef.current && !panelRef.current.contains(target)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const markAllRead = async () => {
    const res = await apiFetch("/api/notifications", { method: "POST", body: JSON.stringify({ all: true }) });
    if (!res) return;
    setItems((prev) => prev.map((n) => (n.read ? n : { ...n, read: true })));
    setUnread(0);
  };

  const markRead = async (id: string) => {
    const res = await apiFetch("/api/notifications", { method: "POST", body: JSON.stringify({ id }) });
    if (!res) return;
    setItems((prev) => prev.map((n) => {
      if (n.id !== id || n.read) return n;
      return { ...n, read: true };
    }));
    setUnread((prev) => Math.max(0, prev - 1));
  };

  const clearAll = async () => {
    const res = await apiFetch("/api/notifications", { method: "DELETE", body: JSON.stringify({ all: true }) });
    if (!res) return;
    setItems([]);
    setUnread(0);
  };

  const timeAgo = (iso: string) => {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };

  const icon = (type: string) => {
    if (type === "tip") return "💰";
    if (type === "payout" || type === "payout_paid") return "🏦";
    if (type === "payout_requested") return "⏳";
    if (type === "payout_processing") return "⚙️";
    if (type === "payout_failed") return "❌";
    if (type === "theme_sold") return "🎉";
    if (type === "theme_unlocked") return "🎨";
    if (type === "theme_rejected") return "🚫";
    if (type === "security") return "🔒";
    if (type === "support") return "💬";
    return "🔔";
  };

  const TABS = [
    { key: "all",     label: "All" },
    { key: "payouts", label: "Payouts" },
    { key: "sales",   label: "Sales" },
  ] as const;

  const visibleItems = activeTab === "all"
    ? items
    : items.filter((n) => n.category === activeTab);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg hover:bg-white/10 transition"
        aria-label="Notifications"
      >
        {/* Bell SVG */}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={`w-5 h-5 text-gray-300 transition-transform ${bellBounce ? "animate-[bellBounce_0.5s_ease-out]" : ""}`}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>

        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-blue-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <OverlayPortal>
          <div ref={panelRef}>
          {/* Mobile: Bottom Sheet */}
          <div className="fixed inset-0 z-[9999] md:hidden">
            <div
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-[#0B1220] rounded-t-2xl border-t border-white/[0.12] animate-[slideUp_0.25s_ease-out] max-h-[70vh] flex flex-col">
              {/* Drag handle */}
              <div className="pt-3 pb-1 flex justify-center">
                <div className="w-10 h-1.5 bg-white/20 rounded-full" />
              </div>

              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.12]">
                <span className="text-white text-lg font-semibold">Notifications</span>
                <div className="flex items-center gap-3">
                  {unread > 0 && (
                    <button onClick={markAllRead} className="text-xs text-blue-400 hover:text-blue-300 transition">
                      Mark all read
                    </button>
                  )}
                  {items.length > 0 && (
                    <button onClick={clearAll} className="text-xs text-white/45 hover:text-white/70 transition">
                      Clear all
                    </button>
                  )}
                </div>
              </div>

              {/* Category tabs */}
              <div className="flex gap-1 px-4 py-2 border-b border-white/[0.08]">
                {TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                      activeTab === tab.key
                        ? "bg-blue-500/20 text-blue-400"
                        : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="overflow-y-auto flex-1 p-3 space-y-2">
                {visibleItems.length === 0 ? (
                  <div className="py-10 text-center text-sm text-gray-500">No notifications yet</div>
                ) : (
                  <AnimatePresence>
                    {visibleItems.map((n) => (
                      <motion.div
                        key={n.id}
                        drag="x"
                        dragConstraints={{ left: 0, right: 0 }}
                        dragElastic={{ left: 0, right: 0.5 }}
                        onDragEnd={(_e, info) => {
                          if (info.offset.x > 80) markRead(n.id);
                        }}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: 100 }}
                        transition={{ duration: 0.2 }}
                        onClick={() => { if (!n.read) markRead(n.id); }}
                        className={`w-full text-left flex gap-3 p-3 rounded-xl border border-white/[0.12] transition cursor-pointer ${!n.read ? "bg-white/5" : "bg-white/[.02]"}`}
                      >
                        <span className="text-xl mt-0.5">{icon(n.type)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-sm font-medium truncate ${!n.read ? "text-white" : "text-gray-400"}`}>{n.title}</span>
                            {!n.read && <span className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" />}
                          </div>
                          <div className="text-xs text-gray-400 truncate">{n.body}</div>
                          <div className="text-[10px] text-gray-500 mt-1">{timeAgo(n.created_at)}</div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </div>
          </div>

          {/* Desktop: Backdrop */}
          <div
            onClick={() => setOpen(false)}
            className="hidden md:block fixed inset-0 z-[9998]"
          />

          {/* Desktop: Dropdown */}
          <div className="hidden md:block fixed top-16 right-4 z-[9999] w-[90%] max-w-sm bg-[#0B1220] rounded-xl border border-white/[0.12] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.12]">
              <span className="text-sm font-semibold text-white">Notifications</span>
              <div className="flex items-center gap-3">
                {unread > 0 && (
                  <button onClick={markAllRead} className="text-xs text-blue-400 hover:text-blue-300 transition">
                    Mark all read
                  </button>
                )}
                {items.length > 0 && (
                  <button onClick={clearAll} className="text-xs text-white/45 hover:text-white/70 transition">
                    Clear all
                  </button>
                )}
              </div>
            </div>

            {/* Category tabs */}
            <div className="flex gap-1 px-4 py-2 border-b border-white/[0.08]">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                    activeTab === tab.key
                      ? "bg-blue-500/20 text-blue-400"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {visibleItems.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-500">No notifications yet</div>
              ) : (
                visibleItems.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => { if (!n.read) markRead(n.id); }}
                    className={`w-full text-left px-4 py-3 flex gap-3 items-start hover:bg-white/5 transition ${!n.read ? "bg-white/[.03]" : ""}`}
                  >
                    <span className="text-lg mt-0.5">{icon(n.type)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm font-medium truncate ${!n.read ? "text-white" : "text-gray-400"}`}>{n.title}</span>
                        {!n.read && <span className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" />}
                      </div>
                      <div className="text-xs text-gray-500 truncate">{n.body}</div>
                      <div className="text-[10px] text-gray-600 mt-0.5">{timeAgo(n.created_at)}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
          </div>
        </OverlayPortal>
      )}
    </div>
  );
}
