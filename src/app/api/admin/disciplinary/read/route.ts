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
      .select("id, to_admin_id, read_at")
      .eq("id", ticketId)
      .maybeSingle();

    if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    if (ticket.to_admin_id !== admin.id) {
      return NextResponse.json({ error: "Only recipient can read this ticket" }, { status: 403 });
    }

    if (!ticket.read_at) {
      const { error: updateError } = await supabaseAdmin
        .from("admin_tickets")
        .update({ read_at: new Date().toISOString() })
        .eq("id", ticket.id)
        .is("read_at", null);

      if (updateError) {
        return NextResponse.json({ error: "Failed to mark ticket as read" }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
