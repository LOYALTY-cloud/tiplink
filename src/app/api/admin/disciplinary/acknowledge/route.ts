import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const ticketId = typeof body?.ticketId === "string" ? body.ticketId : null;
    const notificationId = typeof body?.notificationId === "string" ? body.notificationId : null;

    if (!ticketId) {
      return NextResponse.json({ error: "ticketId is required" }, { status: 400 });
    }

    const { data: admin } = await supabaseAdmin
      .from("admins")
      .select("id")
      .eq("user_id", session.userId)
      .maybeSingle();

    if (!admin) return NextResponse.json({ error: "Admin not found" }, { status: 404 });

    const { data: ticket } = await supabaseAdmin
      .from("admin_tickets")
      .select("id, to_admin_id, status, read_at")
      .eq("id", ticketId)
      .maybeSingle();

    if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    if (ticket.to_admin_id !== admin.id) {
      return NextResponse.json({ error: "Only recipient can acknowledge" }, { status: 403 });
    }

    if (!ticket.read_at) {
      return NextResponse.json(
        { error: "Ticket must be read before acknowledgement" },
        { status: 409 },
      );
    }

    if (ticket.status === "open") {
      const { error: updateError } = await supabaseAdmin
        .from("admin_tickets")
        .update({ status: "acknowledged", acknowledged_at: new Date().toISOString() })
        .eq("id", ticket.id);

      if (updateError) {
        return NextResponse.json({ error: "Failed to acknowledge ticket" }, { status: 500 });
      }

      await supabaseAdmin.from("admin_actions").insert({
        admin_id: session.userId,
        action: "admin_ticket_acknowledged",
        severity: "info",
        metadata: { ticket_id: ticket.id, source: "disciplinary_ack_api" },
      }).then(() => {}, () => {});
    }

    let notifQuery = supabaseAdmin
      .from("admin_notifications")
      .update({
        read: true,
        status: "resolved",
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("admin_id", admin.id)
      .eq("ticket_id", ticket.id);

    if (notificationId) notifQuery = notifQuery.eq("id", notificationId);
    await notifQuery.then(() => {}, () => {});

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
