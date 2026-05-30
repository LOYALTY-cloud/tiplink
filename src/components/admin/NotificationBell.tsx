"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getAdminHeaders, getAdminSession } from "@/lib/auth/adminSession";

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
  created_at: string;
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
  review_request: "/admin/users",
};

function normalizeNotification(raw: Partial<AdminNotif> & { id: string }): AdminNotif {
  const priority = raw.priority ?? "medium";
  const visibility = raw.visibility ?? "private";
  const link = raw.link && raw.link.trim()
    ? raw.link
    : TYPE_LINK_FALLBACK[raw.type ?? ""] ?? null;

  return {
    id: raw.id,
    title: raw.title ?? "Admin Notification",
    message: raw.message ?? "",
    type: raw.type ?? "admin_alert",
    link,
    priority,
    visibility,
    role_target: raw.role_target ?? null,
    admin_target: raw.admin_target ?? null,
    admin_id: raw.admin_id ?? null,
    read: raw.read ?? false,
    status: raw.status ?? "open",
    requires_action: raw.requires_action ?? false,
    resolved_at: raw.resolved_at ?? null,
    archived: raw.archived ?? false,
    created_at: raw.created_at ?? new Date().toISOString(),
  };
}

function isActiveNotification(notification: Partial<AdminNotif>): boolean {
  const archived = notification.archived ?? false;
  const status = notification.status ?? "open";
  return !archived && (status === "open" || status === "in_progress");
}

export default function NotificationBell() {
  const router = useRouter();
  const adminSession = useMemo(() => getAdminSession(), []);
  const adminRole = adminSession?.role ?? null;
  const adminId = adminSession?.admin_id ?? null;
  const [items, setItems] = useState<AdminNotif[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/notifications?includeRead=1", {
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

  // Initial fetch + 30-second polling (realtime is blocked by RLS on anon key,
  // so polling is the primary refresh mechanism).
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    if (!adminRole || !adminId) return;

    const canViewIncoming = (raw: Partial<AdminNotif>) => {
      if (adminRole === "owner" || adminRole === "super_admin") return true;

      const visibility = raw.visibility ?? "private";
      if (visibility === "private") {
        const target = raw.admin_target ?? raw.admin_id ?? null;
        return target === adminId;
      }

      if (visibility === "role") {
        const roleTarget = raw.role_target ?? [];
        return roleTarget.includes(adminRole);
      }

      return visibility === "global";
    };

    const channel = supabase
      .channel(`admin-notifications-${adminId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "admin_notifications",
        },
        (payload) => {
          const incoming = payload.new as Partial<AdminNotif> & { id?: string };
          if (!incoming?.id) return;
          if (!canViewIncoming(incoming)) return;
          if (!isActiveNotification(incoming)) return;

          const normalized = normalizeNotification(incoming as Partial<AdminNotif> & { id: string });
          setItems((prev) => {
            const withoutDup = prev.filter((item) => item.id !== normalized.id);
            return [normalized, ...withoutDup].slice(0, 80);
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "admin_notifications",
        },
        (payload) => {
          const incoming = payload.new as Partial<AdminNotif> & { id?: string };
          if (!incoming?.id) return;
          if (!canViewIncoming(incoming)) return;

          if (!isActiveNotification(incoming)) {
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
  }, [adminId, adminRole]);

  const unreadCount = useMemo(
    () => items.filter((notification) => !notification.read).length,
    [items],
  );

  return (
    <button
      type="button"
      onClick={() => router.push("/admin/notifications")}
      className="relative p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/5 transition"
      aria-label={loading ? "Admin notifications loading" : "Open admin notifications"}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
      </svg>

      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
}
