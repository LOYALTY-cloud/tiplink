import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";

/** GET /api/support/tickets — list user's tickets */
export async function GET(req: Request) {
  try {
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

    const { data: tickets } = await supabaseAdmin
      .from("support_tickets")
      .select("id, subject, category, status, priority, created_at, updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    return NextResponse.json({ tickets: tickets ?? [] });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** POST /api/support/tickets — create a new ticket */
export async function POST(req: Request) {
  try {
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
    const body = await req.json();

    const subject = (body.subject ?? "").trim().slice(0, 200);
    const category = body.category ?? "other";
    const message = (body.message ?? "").trim().slice(0, 2000);
    const file_url = body.file_url ?? null;
    const file_type = body.file_type ?? null;

    if (!subject || !message) {
      return NextResponse.json({ error: "Subject and message required" }, { status: 400 });
    }

    const allowedCategories = ["payment_issue", "account_issue", "bug_report", "payout_issue", "other"];
    if (!allowedCategories.includes(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    // ── Duplicate guard: same user + similar subject within 5 minutes → 409 ──
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recentDupes } = await supabaseAdmin
      .from("support_tickets")
      .select("id")
      .eq("user_id", userId)
      .gte("created_at", fiveMinAgo)
      .limit(5);

    if (recentDupes && recentDupes.length > 0) {
      // Check for same subject (case-insensitive)
      const { data: exactDupe } = await supabaseAdmin
        .from("support_tickets")
        .select("id")
        .eq("user_id", userId)
        .ilike("subject", subject)
        .gte("created_at", fiveMinAgo)
        .limit(1);

      if (exactDupe && exactDupe.length > 0) {
        return NextResponse.json(
          { error: "A similar ticket was already submitted. Please wait a few minutes before creating another." },
          { status: 409 }
        );
      }

      // Rate limit: max 3 tickets per 5 minutes
      if (recentDupes.length >= 3) {
        return NextResponse.json(
          { error: "Too many tickets submitted. Please wait a few minutes." },
          { status: 429 }
        );
      }
    }

    // Auto-detect priority from category
    let priority = 0;
    if (category === "payment_issue" || category === "payout_issue") priority = 1;
    if (category === "bug_report") priority = 1;

    // Check for financial keywords → bump priority
    const lower = message.toLowerCase();
    if (
      lower.includes("stolen") ||
      lower.includes("fraud") ||
      lower.includes("unauthorized") ||
      lower.includes("missing money")
    ) {
      priority = 3;
    } else if (
      lower.includes("refund") ||
      lower.includes("charged twice") ||
      lower.includes("overcharged")
    ) {
      priority = 2;
    }

    // SLA deadlines based on priority
    // Critical (3): 1hr response / 4hr resolve
    // High (2): 2hr response / 8hr resolve
    // Medium (1): 4hr response / 24hr resolve
    // Normal (0): 8hr response / 48hr resolve
    const now = new Date();
    const slaResponseHours = priority === 3 ? 1 : priority === 2 ? 2 : priority === 1 ? 4 : 8;
    const slaResolveHours = priority === 3 ? 4 : priority === 2 ? 8 : priority === 1 ? 24 : 48;
    const sla_response_deadline = new Date(now.getTime() + slaResponseHours * 60 * 60 * 1000).toISOString();
    const sla_resolve_deadline = new Date(now.getTime() + slaResolveHours * 60 * 60 * 1000).toISOString();

    // ── Owner watch mode: auto-add owners as watchers for high priority tickets ──
    let watchers: string[] = [];
    if (priority >= 2) {
      const { data: owners } = await supabaseAdmin
        .from("profiles")
        .select("user_id")
        .eq("role", "owner");
      watchers = (owners ?? []).map((o) => o.user_id);
    }

    const { data: ticket, error } = await supabaseAdmin
      .from("support_tickets")
      .insert({
        user_id: userId,
        subject,
        category,
        message,
        priority,
        file_url,
        file_type,
        sla_response_deadline,
        sla_resolve_deadline,
        last_user_reply_at: now.toISOString(),
        waiting_on: "admin",
        watchers,
      })
      .select("id, subject, category, status, priority, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: "Failed to create ticket" }, { status: 500 });
    }

    // Insert the initial message into the thread
    await supabaseAdmin.from("support_ticket_messages").insert({
      ticket_id: ticket.id,
      sender_type: "user",
      sender_id: userId,
      message,
      file_url,
      file_type,
    });

    // Send confirmation email to user
    createNotification({
      userId,
      type: "support",
      title: `Ticket received: ${subject}`,
      body: `We've received your support ticket and will get back to you soon. Ticket #${ticket.id.slice(0, 8)}.`,
      meta: { ticketId: ticket.id },
    }).catch(() => {});

    return NextResponse.json({ ticket });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
