import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

/**
 * POST /api/admin/tickets/[ticketId]/start-chat
 * Creates (or links to) a live support session for a ticket's user.
 * Returns the session ID so the admin can navigate to it.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { ticketId } = await params;

    const { data: ticket } = await supabaseAdmin
      .from("support_tickets")
      .select("id, user_id, subject, source_session_id")
      .eq("id", ticketId)
      .maybeSingle();

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    // If the ticket already has a linked session, return it
    if (ticket.source_session_id) {
      // Reopen the session if it was closed
      await supabaseAdmin
        .from("support_sessions")
        .update({
          status: "active",
          assigned_admin_id: admin.userId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", ticket.source_session_id)
        .in("status", ["closed"]);

      return NextResponse.json({ sessionId: ticket.source_session_id });
    }

    // Create a new support session linked to this ticket
    const sessionId = crypto.randomUUID();

    // Get admin display name
    const { data: adminProfile } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("user_id", admin.userId)
      .maybeSingle();

    const { error: sessErr } = await supabaseAdmin
      .from("support_sessions")
      .insert({
        id: sessionId,
        user_id: ticket.user_id,
        status: "active",
        assigned_admin_id: admin.userId,
        assigned_admin_name: adminProfile?.display_name || "Admin",
        mode: "human",
        last_message: `Live chat started from ticket: ${ticket.subject}`,
      });

    if (sessErr) {
      return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
    }

    // Link session back to ticket
    await supabaseAdmin
      .from("support_tickets")
      .update({ source_session_id: sessionId })
      .eq("id", ticketId);

    // Notify user about live chat availability
    await supabaseAdmin.from("support_ticket_messages").insert({
      ticket_id: ticketId,
      sender_type: "system",
      message: "An admin has started a live chat session for this ticket. Check your Support Center to join.",
    });

    return NextResponse.json({ sessionId });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
