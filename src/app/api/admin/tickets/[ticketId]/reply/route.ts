import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";

/** POST /api/admin/tickets/[ticketId]/reply — admin replies to a ticket */
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
    const body = await req.json();
    const message = (body.message ?? "").trim().slice(0, 2000);
    const isInternal = body.is_internal === true;
    const file_url = body.file_url ?? null;
    const file_type = body.file_type ?? null;

    if (!message && !file_url) {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }

    // Verify ticket exists
    const { data: ticket } = await supabaseAdmin
      .from("support_tickets")
      .select("id, status, user_id, subject, first_response_at")
      .eq("id", ticketId)
      .maybeSingle();

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    // Get admin display name
    const { data: adminProfile } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("user_id", admin.userId)
      .maybeSingle();

    const { data: msg, error } = await supabaseAdmin
      .from("support_ticket_messages")
      .insert({
        ticket_id: ticketId,
        sender_type: "admin",
        sender_id: admin.userId,
        sender_name: adminProfile?.display_name || "Admin",
        message: message || (file_url ? "📎 Attachment" : ""),
        is_internal: isInternal,
        file_url,
        file_type,
      })
      .select("id, sender_type, sender_name, message, is_internal, file_url, file_type, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: "Failed to send reply" }, { status: 500 });
    }

    // Auto-assign ticket to this admin if unassigned, and set in_progress
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (ticket.status === "open") {
      updates.status = "in_progress";
      updates.assigned_admin_id = admin.userId;
    }

    // Track first response time for SLA
    if (!ticket.first_response_at && !isInternal) {
      updates.first_response_at = new Date().toISOString();
    }

    // Waiting-on state: admin replied → now waiting on user
    if (!isInternal) {
      updates.waiting_on = "user";
    }

    await supabaseAdmin
      .from("support_tickets")
      .update(updates)
      .eq("id", ticketId);

    // Send email notification to user (only for non-internal replies)
    if (!isInternal) {
      createNotification({
        userId: ticket.user_id,
        type: "support",
        title: `Reply on: ${ticket.subject}`,
        body: message.length > 200 ? message.slice(0, 200) + "…" : message,
        meta: { ticketId },
      }).catch(() => {});
    }

    return NextResponse.json({ message: msg });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
