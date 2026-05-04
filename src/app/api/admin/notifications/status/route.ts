import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

type AdminNotificationRow = {
  id: string;
  visibility: "private" | "role" | "global" | null;
  role_target: string[] | null;
  admin_target: string | null;
  admin_id: string | null;
  requires_action: boolean | null;
  status: "open" | "in_progress" | "resolved" | "dismissed" | null;
  archived: boolean | null;
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

const ALLOWED_STATUS = new Set(["open", "in_progress", "resolved", "dismissed"]);

export async function POST(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const id = typeof body?.id === "string" ? body.id : null;
    const status = typeof body?.status === "string" ? body.status : null;

    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    if (!status || !ALLOWED_STATUS.has(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const { data: admin } = await supabaseAdmin
      .from("admins")
      .select("id")
      .eq("user_id", session.userId)
      .maybeSingle();

    if (!admin) return NextResponse.json({ error: "Admin not found" }, { status: 404 });

    const { data: notification, error: fetchError } = await supabaseAdmin
      .from("admin_notifications")
      .select("id, visibility, role_target, admin_target, admin_id, requires_action, status, archived")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
    if (!notification) return NextResponse.json({ error: "Notification not found" }, { status: 404 });

    const row = notification as AdminNotificationRow;
    if (!canViewNotification(row, session.role, admin.id)) {
      return NextResponse.json({ error: "Notification not visible" }, { status: 403 });
    }

    if (status === "dismissed" && row.requires_action) {
      return NextResponse.json({ error: "Action-required notifications cannot be dismissed" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const archived = status === "resolved" || status === "dismissed";
    const { error: updateError } = await supabaseAdmin
      .from("admin_notifications")
      .update({
        status,
        archived,
        resolved_at: status === "resolved" ? now : null,
        updated_at: now,
      })
      .eq("id", id);

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
