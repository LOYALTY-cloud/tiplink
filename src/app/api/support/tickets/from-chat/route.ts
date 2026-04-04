import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** POST /api/support/tickets/from-chat — convert a live chat session into a ticket */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: authData, error: authErr } =
      await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authData.user.id;
    const body = await req.json();
    const sessionId = (body.sessionId ?? "").trim();
    const subject = (body.subject ?? "Chat conversation").trim().slice(0, 200);

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId required" },
        { status: 400 }
      );
    }

    // Verify session belongs to user
    const { data: session } = await supabaseAdmin
      .from("support_sessions")
      .select("id, user_id, last_message")
      .eq("id", sessionId)
      .maybeSingle();

    if (!session || session.user_id !== userId) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Fetch chat messages
    const { data: chatMessages } = await supabaseAdmin
      .from("support_messages")
      .select(
        "sender_type, sender_id, sender_name, message, file_url, file_type, created_at"
      )
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (!chatMessages || chatMessages.length === 0) {
      return NextResponse.json(
        { error: "No messages to convert" },
        { status: 400 }
      );
    }

    // Build summary from first user message
    const firstUserMsg = chatMessages.find((m) => m.sender_type === "user");
    const ticketMessage =
      firstUserMsg?.message ?? session.last_message ?? "Converted from chat";

    // Create ticket
    const now = new Date();
    const sla_response_deadline = new Date(
      now.getTime() + 4 * 60 * 60 * 1000
    ).toISOString();
    const sla_resolve_deadline = new Date(
      now.getTime() + 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: ticket, error: ticketErr } = await supabaseAdmin
      .from("support_tickets")
      .insert({
        user_id: userId,
        subject,
        category: "other",
        message: ticketMessage,
        priority: 1,
        source: "chat",
        source_session_id: sessionId,
        sla_response_deadline,
        sla_resolve_deadline,
      })
      .select("id, subject, status, priority, created_at")
      .single();

    if (ticketErr || !ticket) {
      return NextResponse.json(
        { error: "Failed to create ticket" },
        { status: 500 }
      );
    }

    // Copy chat messages into ticket thread
    const ticketMessages = chatMessages.map((m) => ({
      ticket_id: ticket.id,
      sender_type: m.sender_type === "admin" ? "admin" : "user",
      sender_id: m.sender_id,
      sender_name: m.sender_name ?? null,
      message: m.message,
      file_url: m.file_url ?? null,
      file_type: m.file_type ?? null,
    }));

    await supabaseAdmin.from("support_ticket_messages").insert(ticketMessages);

    return NextResponse.json({ ticket });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
