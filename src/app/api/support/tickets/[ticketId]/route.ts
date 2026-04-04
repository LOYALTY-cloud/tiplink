import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** GET /api/support/tickets/[ticketId] — get ticket detail + messages */
export async function GET(
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

    // Fetch ticket (verify ownership)
    const { data: ticket } = await supabaseAdmin
      .from("support_tickets")
      .select("*")
      .eq("id", ticketId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    // Fetch messages (exclude internal admin notes)
    const { data: messages } = await supabaseAdmin
      .from("support_ticket_messages")
      .select("id, sender_type, sender_name, message, file_url, file_type, created_at")
      .eq("ticket_id", ticketId)
      .eq("is_internal", false)
      .order("created_at", { ascending: true });

    return NextResponse.json({ ticket, messages: messages ?? [] });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
