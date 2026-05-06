import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

type NotificationRow = {
  id: string;
  type: string;
  title: string | null;
  message: string | null;
  status: "open" | "in_progress" | "resolved" | "dismissed" | null;
  requires_action: boolean | null;
  archived: boolean | null;
  created_at: string;
  ticket_id: string | null;
  ticket: {
    id: string;
    type: string;
    status: string;
    message: string;
    created_at: string;
    read_at: string | null;
    acknowledged_at: string | null;
  } | null;
};

type NotificationQueryRow = Omit<NotificationRow, "ticket"> & {
  ticket: Array<NonNullable<NotificationRow["ticket"]>> | NonNullable<NotificationRow["ticket"]> | null;
};

function normalizeTicket(
  ticket: NotificationQueryRow["ticket"],
): NotificationRow["ticket"] {
  if (Array.isArray(ticket)) {
    return ticket[0] ?? null;
  }
  return ticket ?? null;
}

export async function GET(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ reports: [] });

    const { data: admin } = await supabaseAdmin
      .from("admins")
      .select("id")
      .eq("user_id", session.userId)
      .maybeSingle();

    if (!admin) return NextResponse.json({ reports: [] });

    const { data, error } = await supabaseAdmin
      .from("admin_notifications")
      .select("id, type, title, message, status, requires_action, archived, created_at, ticket_id, ticket:ticket_id(id, type, status, message, created_at, read_at, acknowledged_at)")
      .eq("admin_id", admin.id)
      .eq("type", "disciplinary_report")
      .eq("requires_action", true)
      .eq("archived", false)
      .in("status", ["open", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: "Failed to fetch pending disciplinary items." }, { status: 500 });
    }

    const rows = ((data ?? []) as NotificationQueryRow[])
      .map((row) => ({
        ...row,
        ticket: normalizeTicket(row.ticket),
      }))
      .filter((row): row is NotificationRow => row.ticket?.status === "open");

    const reports = rows.map((row) => ({
      id: row.id,
      notification_id: row.id,
      ticket_id: row.ticket_id,
      reason: row.message || row.ticket?.message || "Disciplinary report issued",
      title: row.title || "Disciplinary Notice",
      severity: row.ticket?.type || "warning",
      created_at: row.created_at,
      read_at: row.ticket?.read_at || null,
      status: row.status || "open",
      requires_action: row.requires_action ?? true,
      ticket_status: row.ticket?.status || null,
    }));

    return NextResponse.json({ reports });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
