import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** POST /api/support/tickets/[ticketId]/reply — user adds a reply to their ticket */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  try {
    const { ticketId } = await params;
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authData.user.id;

    // Verify ticket ownership and not closed
    const { data: ticket } = await supabaseAdmin
      .from("support_tickets")
      .select("id, status, user_id, updated_at")
      .eq("id", ticketId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    // Allow reopening closed tickets within 7 days
    if (ticket.status === "closed") {
      const closedAt = ticket.updated_at ? new Date(ticket.updated_at).getTime() : 0;
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - closedAt > sevenDays) {
        return NextResponse.json(
          { error: "This ticket was closed more than 7 days ago. Please open a new ticket." },
          { status: 400 }
        );
      }
      // Will be reopened below via ticketUpdates
    }

    const body = await req.json();
    const message = (body.message ?? "").trim().slice(0, 2000);
    const file_url = body.file_url ?? null;
    const file_type = body.file_type ?? null;

    if (!message && !file_url) {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }

    const { data: msg, error } = await supabaseAdmin
      .from("support_ticket_messages")
      .insert({
        ticket_id: ticketId,
        sender_type: "user",
        sender_id: userId,
        message: message || (file_url ? "📎 Attachment" : ""),
        file_url,
        file_type,
      })
      .select("id, sender_type, message, file_url, file_type, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: "Failed to send reply" }, { status: 500 });
    }

    // Update ticket timestamp + auto-reopen if resolved/closed (status automation)
    const ticketUpdates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      waiting_on: "admin",
      last_user_reply_at: new Date().toISOString(),
      auto_close_warning_sent: false,
      nudge_count: 0,
    };

    // If user replies to a resolved or closed ticket, reopen it
    if (ticket.status === "resolved" || ticket.status === "closed") {
      ticketUpdates.status = "open";
      ticketUpdates.resolved_at = null;
    }

    await supabaseAdmin
      .from("support_tickets")
      .update(ticketUpdates)
      .eq("id", ticketId);

    return NextResponse.json({ message: msg });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
