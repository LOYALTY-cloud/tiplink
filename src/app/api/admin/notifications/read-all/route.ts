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

    const { data: admin } = await supabaseAdmin
      .from("admins")
      .select("id")
      .eq("user_id", session.userId)
      .maybeSingle();

    if (!admin) return NextResponse.json({ ok: true });

    const { data, error: listError } = await supabaseAdmin
      .from("admin_notifications")
      .select("id, read, status, archived, visibility, role_target, admin_target, admin_id")
      .order("created_at", { ascending: false })
      .limit(240);

    if (listError) return NextResponse.json({ error: "Failed to fetch notifications." }, { status: 500 });

    const targetIds = ((data ?? []) as AdminNotificationRow[])
      .filter((row) => !row.read)
      .filter((row) => !(row.archived ?? false))
      .filter((row) => {
        const status = row.status ?? "open";
        return status === "open" || status === "in_progress";
      })
      .filter((row) => canViewNotification(row, session.role, admin.id))
      .map((row) => row.id);

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
