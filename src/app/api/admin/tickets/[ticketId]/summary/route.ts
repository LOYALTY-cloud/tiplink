import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

/**
 * GET /api/admin/tickets/[ticketId]/summary
 * Returns a structured snapshot of the ticket thread:
 * issue type, age, status, message count, last user message, key events
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { ticketId } = await params;

  const { data: ticket } = await supabaseAdmin
    .from("support_tickets")
    .select("id, subject, category, status, priority, assigned_admin_id, waiting_on, breach_count, created_at, updated_at, first_response_at, sla_response_deadline, sla_resolve_deadline")
    .eq("id", ticketId)
    .single();

  if (!ticket) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: messages } = await supabaseAdmin
    .from("support_ticket_messages")
    .select("id, sender_type, message, is_internal, created_at")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  const allMsgs = messages ?? [];
  const userMessages = allMsgs.filter((m) => m.sender_type === "user");
  const adminMessages = allMsgs.filter((m) => m.sender_type === "admin" && !m.is_internal);
  const internalNotes = allMsgs.filter((m) => m.is_internal === true);
  const systemEvents = allMsgs.filter((m) => m.sender_type === "system");

  const ageMs = Date.now() - new Date(ticket.created_at).getTime();
  const ageHours = Math.round(ageMs / (1000 * 60 * 60));
  const ageDays = Math.floor(ageHours / 24);
  const ageLabel = ageDays > 0 ? `${ageDays}d ${ageHours % 24}h` : `${ageHours}h`;

  // SLA status
  const now = Date.now();
  const responseBreached = ticket.sla_response_deadline && !ticket.first_response_at && new Date(ticket.sla_response_deadline).getTime() < now;
  const resolveBreached = ticket.sla_resolve_deadline && !["resolved", "closed"].includes(ticket.status) && new Date(ticket.sla_resolve_deadline).getTime() < now;

  const lastUserMsg = userMessages.length > 0 ? userMessages[userMessages.length - 1] : null;

  const summary = {
    ticketId: ticket.id,
    subject: ticket.subject,
    category: ticket.category,
    status: ticket.status,
    priority: ticket.priority,
    priorityLabel: ticket.priority === 3 ? "Critical" : ticket.priority === 2 ? "High" : ticket.priority === 1 ? "Medium" : "Normal",
    waitingOn: ticket.waiting_on,
    age: ageLabel,
    breachCount: ticket.breach_count ?? 0,
    sla: {
      responseBreached: !!responseBreached,
      resolveBreached: !!resolveBreached,
    },
    counts: {
      total: allMsgs.length,
      user: userMessages.length,
      admin: adminMessages.length,
      internal: internalNotes.length,
      system: systemEvents.length,
    },
    lastUserMessage: lastUserMsg
      ? { message: lastUserMsg.message.slice(0, 300), at: lastUserMsg.created_at }
      : null,
    systemEvents: systemEvents.map((e) => ({
      message: e.message,
      at: e.created_at,
    })),
  };

  return NextResponse.json({ summary });
}
