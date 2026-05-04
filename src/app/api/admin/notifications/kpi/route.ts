import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

type AdminNotificationRow = {
  id: string;
  priority: "low" | "medium" | "high" | "critical" | null;
  status: "open" | "in_progress" | "resolved" | "dismissed" | null;
  requires_action: boolean | null;
  archived: boolean | null;
  visibility: "private" | "role" | "global" | null;
  role_target: string[] | null;
  admin_target: string | null;
  admin_id: string | null;
};

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
    return (notification.role_target ?? []).includes(role);
  }
  return visibility === "global";
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

    if (!admin) {
      return NextResponse.json({ open: 0, critical: 0, action: 0, mine: 0 });
    }

    const { data, error } = await supabaseAdmin
      .from("admin_notifications")
      .select("id, priority, status, requires_action, archived, visibility, role_target, admin_target, admin_id")
      .eq("archived", false)
      .order("created_at", { ascending: false })
      .limit(240);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const visible = ((data ?? []) as AdminNotificationRow[])
      .filter((notification) => canViewNotification(notification, session.role, admin.id));

    return NextResponse.json({
      open: visible.filter((notification) => (notification.status ?? "open") === "open").length,
      critical: visible.filter((notification) => notification.priority === "critical").length,
      action: visible.filter((notification) => notification.requires_action === true).length,
      mine: visible.filter((notification) => {
        const status = notification.status ?? "open";
        const targetId = notification.admin_target ?? notification.admin_id;
        return targetId === admin.id && status !== "resolved" && status !== "dismissed";
      }).length,
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
