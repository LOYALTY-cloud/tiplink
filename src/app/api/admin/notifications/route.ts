import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

type RoleName = "owner" | "super_admin" | "finance_admin" | "support_admin" | "admin";

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
};

function getNotificationLink(notification: AdminNotificationRow): string | null {
  if (notification.link && notification.link.trim()) return notification.link;
  return TYPE_LINK_FALLBACK[notification.type] ?? null;
}

type AdminNotificationRow = {
  id: string;
  type: string;
  title: string | null;
  message: string | null;
  link: string | null;
  read: boolean;
  status: "open" | "in_progress" | "resolved" | "dismissed" | null;
  requires_action: boolean | null;
  resolved_at: string | null;
  archived: boolean | null;
  created_at: string;
  ticket_id: string | null;
  priority: "low" | "medium" | "high" | "critical" | null;
  visibility: "private" | "role" | "global" | null;
  role_target: string[] | null;
  admin_target: string | null;
  admin_id: string | null;
  metadata: Record<string, unknown> | null;
  ticket: {
    id: string;
    type: string;
    status: string;
    message: string;
    created_at: string;
    acknowledged_at: string | null;
  } | null;
};

type AdminNotificationQueryRow = Omit<AdminNotificationRow, "ticket"> & {
  ticket: Array<NonNullable<AdminNotificationRow["ticket"]>> | NonNullable<AdminNotificationRow["ticket"]> | null;
};

function normalizeTicket(
  ticket: AdminNotificationQueryRow["ticket"],
): AdminNotificationRow["ticket"] {
  if (Array.isArray(ticket)) {
    return ticket[0] ?? null;
  }
  return ticket ?? null;
}

function canViewNotification(
  notification: AdminNotificationRow,
  role: string,
  adminId: string,
): boolean {
  if (role === "owner" || role === "super_admin") return true;

  const visibility = notification.visibility ?? "private";
  if (visibility === "private") {
    const targetId = notification.admin_target ?? notification.admin_id;
    return targetId === adminId;
  }

  if (visibility === "role") {
    const roles = notification.role_target ?? [];
    return roles.includes(role);
  }

  if (visibility === "global") return true;
  return false;
}

export async function GET(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data: admin } = await supabaseAdmin
      .from("admins")
      .select("id")
      .eq("user_id", session.userId)
      .maybeSingle();

    if (!admin) return NextResponse.json({ notifications: [] });

    const url = new URL(req.url);
    const includeRead = url.searchParams.get("includeRead") === "1";
    const includeHistory = url.searchParams.get("includeHistory") === "1";

    const { data, error } = await supabaseAdmin
      .from("admin_notifications")
      .select("id, type, title, message, link, read, status, requires_action, resolved_at, archived, created_at, ticket_id, priority, visibility, role_target, admin_target, admin_id, metadata, ticket:ticket_id(id, type, status, message, created_at, acknowledged_at)")
      .order("created_at", { ascending: false })
      .limit(120);

    if (error) return NextResponse.json({ error: "Failed to fetch notifications." }, { status: 500 });

    const allNotifications = ((data ?? []) as AdminNotificationQueryRow[]).map((notification) => ({
      ...notification,
      ticket: normalizeTicket(notification.ticket),
    }));
    const visible = allNotifications.filter((notification) =>
      canViewNotification(notification, session.role, admin.id),
    );

    const activeOnly = visible.filter((notification) => {
      const archived = notification.archived ?? false;
      const status = notification.status ?? "open";
      if (includeHistory) return true;
      return !archived && (status === "open" || status === "in_progress");
    });

    const filtered = includeRead ? activeOnly : activeOnly.filter((notification) => !notification.read);

    const notifications = filtered.slice(0, 60).map((notification) => ({
      ...notification,
      link: getNotificationLink(notification),
      status: notification.status ?? "open",
      requires_action: notification.requires_action ?? false,
      archived: notification.archived ?? false,
      priority: notification.priority ?? "medium",
      visibility: notification.visibility ?? "private",
      metadata: notification.metadata ?? null,
    }));

    return NextResponse.json({ notifications });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data: admin } = await supabaseAdmin
      .from("admins")
      .select("id")
      .eq("user_id", session.userId)
      .maybeSingle();

    if (!admin) return NextResponse.json({ ok: true });

    const body = await req.json().catch(() => ({}));
    const notificationId = typeof body?.notificationId === "string" ? body.notificationId : null;
    const all = body?.all === true;

    const { data: allRows, error: listError } = await supabaseAdmin
      .from("admin_notifications")
      .select("id, type, title, message, link, read, status, requires_action, resolved_at, archived, created_at, ticket_id, priority, visibility, role_target, admin_target, admin_id")
      .order("created_at", { ascending: false })
      .limit(240);

    if (listError) return NextResponse.json({ error: "Failed to fetch notifications." }, { status: 500 });

    const visibleUnreadIds = ((allRows ?? []) as AdminNotificationRow[])
      .filter((notification) => !notification.read)
      .filter((notification) => !(notification.archived ?? false))
      .filter((notification) => canViewNotification(notification, session.role as RoleName, admin.id))
      .map((notification) => notification.id);

    if (!all && notificationId && !visibleUnreadIds.includes(notificationId)) {
      return NextResponse.json({ error: "Notification not visible" }, { status: 403 });
    }
    if (!all && !notificationId) {
      return NextResponse.json({ error: "notificationId or all=true required" }, { status: 400 });
    }

    const targetIds = all
      ? visibleUnreadIds
      : visibleUnreadIds.filter((id) => id === notificationId);

    if (!targetIds.length) return NextResponse.json({ ok: true });

    const { error } = await supabaseAdmin
      .from("admin_notifications")
      .update({ read: true })
      .in("id", targetIds);

    if (error) return NextResponse.json({ error: "Failed to update notifications." }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
