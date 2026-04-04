import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { createNotification } from "@/lib/notifications";
import { generateTicketSummary } from "@/lib/support/ticketAI";
import { updateAdminPerformance } from "@/lib/support/autoAssign";

export const runtime = "nodejs";

/** GET /api/admin/tickets/[ticketId] — get ticket details for admin */
export async function GET(
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
      .select("*")
      .eq("id", ticketId)
      .maybeSingle();

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const { data: messages } = await supabaseAdmin
      .from("support_ticket_messages")
      .select("id, sender_type, sender_id, sender_name, message, file_url, file_type, is_internal, created_at")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });

    // Fetch user profile
    const { data: userProfile } = await supabaseAdmin
      .from("profiles")
      .select("user_id, display_name, handle, email")
      .eq("user_id", ticket.user_id)
      .maybeSingle();

    return NextResponse.json({
      ticket,
      messages: messages ?? [],
      user: userProfile ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** PATCH /api/admin/tickets/[ticketId] — update ticket status/assignment */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { ticketId } = await params;
    const body = await req.json();

    // Fetch current ticket for context (user_id, subject, current status)
    const { data: currentTicket } = await supabaseAdmin
      .from("support_tickets")
      .select("user_id, subject, status, category, assigned_admin_id, created_at")
      .eq("id", ticketId)
      .maybeSingle();

    if (!currentTicket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.status) {
      const allowed = ["open", "in_progress", "resolved", "closed"];
      if (!allowed.includes(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      updates.status = body.status;
      if (body.status === "resolved") {
        updates.resolved_at = new Date().toISOString();
      }
    }

    if (body.assigned_admin_id !== undefined) {
      updates.assigned_admin_id = body.assigned_admin_id;
    }

    if (body.priority !== undefined) {
      updates.priority = body.priority;
    }

    const { data: ticket, error } = await supabaseAdmin
      .from("support_tickets")
      .update(updates)
      .eq("id", ticketId)
      .select("id, status, assigned_admin_id, priority, updated_at")
      .single();

    if (error) {
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    // Log admin action
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: admin.userId,
      action: "ticket_updated",
      metadata: { ticket_id: ticketId, changes: updates },
    });

    // Send email notification when ticket is resolved or closed (only if status actually changed)
    const statusChanged = body.status && body.status !== currentTicket.status;
    if (statusChanged && (body.status === "resolved" || body.status === "closed")) {
      const statusLabel = body.status === "resolved" ? "resolved" : "closed";
      createNotification({
        userId: currentTicket.user_id,
        type: "support",
        title: `Ticket ${statusLabel}: ${currentTicket.subject}`,
        body: `Your support ticket has been ${statusLabel}. If you still need help, you can reply to reopen it.`,
        meta: { ticketId },
      }).catch(() => {});

      // Generate AI summary and save to user profile history (fire-and-forget)
      generateTicketSummary(ticketId).catch(() => {});

      // Update admin performance stats for skill-weighted routing
      const assignee = currentTicket.assigned_admin_id ?? admin.userId;
      const resolutionMs = Date.now() - new Date(currentTicket.created_at).getTime();
      updateAdminPerformance(
        assignee,
        currentTicket.category ?? "other",
        resolutionMs,
        body.status === "resolved",
      ).catch(() => {});
    }

    return NextResponse.json({ ticket });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
