import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

type AdminNotificationRow = {
  id: string;
  read: boolean;
  status: "open" | "in_progress" | "resolved" | "dismissed" | null;
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

export async function POST(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const id = typeof body?.id === "string" ? body.id : null;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const { data: admin } = await supabaseAdmin
      .from("admins")
      .select("id")
      .eq("user_id", session.userId)
      .maybeSingle();

    if (!admin) return NextResponse.json({ error: "Admin not found" }, { status: 404 });

    const { data: notification, error: fetchError } = await supabaseAdmin
      .from("admin_notifications")
      .select("id, read, status, archived, visibility, role_target, admin_target, admin_id")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
    if (!notification) return NextResponse.json({ error: "Notification not found" }, { status: 404 });

    const row = notification as AdminNotificationRow;
    const status = row.status ?? "open";
    if ((row.archived ?? false) || (status !== "open" && status !== "in_progress")) {
      return NextResponse.json({ error: "Notification is not active" }, { status: 400 });
    }
    if (!canViewNotification(row, session.role, admin.id)) {
      return NextResponse.json({ error: "Notification not visible" }, { status: 403 });
    }

    if (!row.read) {
      const { error } = await supabaseAdmin
        .from("admin_notifications")
        .update({ read: true })
        .eq("id", id);

      if (error) return NextResponse.json({ error: "Failed to update notification." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
