import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    let userId: string | null = null;

    if (token) {
      const { data, error } = await supabaseAdmin.auth.getUser(token);
      if (!error && data?.user) {
        userId = data.user.id;
      }
    }

    const { sessionId, message } = await req.json();

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }

    // Auto-assign priority based on user context
    let priority = 0;
    if (userId) {
      const { data: wallet } = await supabaseAdmin
        .from("wallets")
        .select("balance")
        .eq("user_id", userId)
        .maybeSingle();

      const balance = Number(wallet?.balance || 0);
      if (balance > 1000) priority = 2;
      else if (balance > 100) priority = 1;
    }

    // Boost priority for urgent keywords
    const msg = (message || "").toLowerCase();
    if (msg.includes("refund") || msg.includes("fraud") || msg.includes("stolen")) {
      priority = Math.max(priority, 3);
    } else if (msg.includes("payout") || msg.includes("withdraw") || msg.includes("urgent")) {
      priority = Math.max(priority, 2);
    }

    // Check if this session already exists (e.g. page reload)
    const { data: existing } = await supabaseAdmin
      .from("support_sessions")
      .select("id, status, assigned_admin_id, assigned_admin_name, mode")
      .eq("id", sessionId)
      .maybeSingle();

    if (existing && existing.status !== "closed") {
      // Session already exists and is still open — return its current state
      return NextResponse.json({
        ok: true,
        mode: existing.mode || "human",
        assigned: existing.assigned_admin_name,
        existing: true,
      });
    }

    // If the previous session was closed, generate a fresh session ID
    // so the user gets a clean conversation in the admin queue.
    if (existing && existing.status === "closed") {
      const newId = crypto.randomUUID();
      const { error: insertErr } = await supabaseAdmin.from("support_sessions").insert({
        id: newId,
        user_id: userId,
        status: "waiting",
        priority,
        mode: "ai",
      });
      if (insertErr) {
        return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
      }

      await supabaseAdmin.from("support_messages").insert({
        session_id: newId,
        sender_type: "system",
        message: "🤖 Support Assistant is ready to help you.",
      });

      return NextResponse.json({ ok: true, mode: "ai", assigned: null, newSessionId: newId });
    }

    // Always start in AI mode — the assistant handles first contact.
    // Admins can take over from the queue, or AI escalates when needed.
    const mode = "ai";

    const { error } = await supabaseAdmin.from("support_sessions").insert({
      id: sessionId,
      user_id: userId,
      status: "waiting",
      priority,
      mode,
    });

    if (error) {
      return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
    }

    // Insert system message so user knows AI is active
    await supabaseAdmin.from("support_messages").insert({
      session_id: sessionId,
      sender_type: "system",
      message: "🤖 Support Assistant is ready to help you.",
    });

    // Don't auto-assign an admin — let user talk to AI first.
    // Admins can take over from the queue or AI will escalate when needed.

    return NextResponse.json({ ok: true, mode, assigned: null });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
