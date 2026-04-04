import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromSession } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

// In-memory rate-limit map: userId -> last message timestamp
const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_MS = 500;
const MAX_MESSAGE_LENGTH = 500;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sessionId, senderType, message } = body;

    if (!sessionId || !senderType || !message) {
      return NextResponse.json(
        { error: "sessionId, senderType, and message are required" },
        { status: 400 }
      );
    }

    if (!["user", "admin"].includes(senderType)) {
      return NextResponse.json(
        { error: "senderType must be 'user' or 'admin'" },
        { status: 400 }
      );
    }

    // Max message length
    if (typeof message !== "string" || message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: `Message must be ${MAX_MESSAGE_LENGTH} characters or less` },
        { status: 400 }
      );
    }

    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    let senderId: string | null = null;
    let senderName: string | null = null;

    if (senderType === "user") {
      // Authenticate user via JWT
      if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
      if (authError || !authData?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      senderId = authData.user.id;

      // Resolve user display name from profile (server-side, not client-trusted)
      const { data: userProfile } = await supabaseAdmin
        .from("profiles")
        .select("display_name, handle")
        .eq("user_id", senderId)
        .maybeSingle();
      senderName = userProfile?.display_name || userProfile?.handle || null;

      // Verify session ownership + status — user can only message their own session
      const { data: session } = await supabaseAdmin
        .from("support_sessions")
        .select("id, status, closed_at, mode")
        .eq("id", sessionId)
        .eq("user_id", senderId)
        .maybeSingle();

      if (!session) {
        return NextResponse.json({ error: "Session not found" }, { status: 403 });
      }

      // Auto-reopen: if closed within 10 min, reopen to waiting
      if (session.status === "closed") {
        const closedAt = session.closed_at ? new Date(session.closed_at).getTime() : 0;
        if (closedAt && Date.now() - closedAt < 10 * 60 * 1000) {
          await supabaseAdmin
            .from("support_sessions")
            .update({ status: "waiting", closed_at: null, closed_by: null, updated_at: new Date().toISOString() })
            .eq("id", sessionId)
            .eq("status", "closed");

          await supabaseAdmin.from("support_messages").insert({
            session_id: sessionId,
            sender_type: "admin",
            sender_id: null,
            sender_name: null,
            message: "⟳ Session reopened by user",
          });
        } else {
          return NextResponse.json({ error: "Session closed" }, { status: 403 });
        }
      } else if (!["waiting", "active"].includes(session.status)) {
        return NextResponse.json({ error: "Session not available" }, { status: 403 });
      }

      // Rate limit per user
      const now = Date.now();
      const lastMsg = rateLimitMap.get(senderId) || 0;
      if (now - lastMsg < RATE_LIMIT_MS) {
        return NextResponse.json({ error: "Too fast" }, { status: 429 });
      }
      rateLimitMap.set(senderId, now);
    } else {
      // Admin auth — verify via JWT or admin_id header
      const adminId = req.headers.get("x-admin-id") ?? body.adminId ?? null;
      const admin = await getAdminFromSession(token, adminId);

      if (!admin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }

      senderId = admin.userId;

      // Resolve admin name from DB (never trust client-sent name)
      const { data: adminProfile } = await supabaseAdmin
        .from("profiles")
        .select("first_name, last_name, display_name")
        .eq("user_id", admin.userId)
        .maybeSingle();
      senderName = adminProfile?.first_name && adminProfile?.last_name
        ? `${adminProfile.first_name} ${adminProfile.last_name}`
        : adminProfile?.display_name || "Admin";

      // Verify session is still open + admin is assigned to it (owner lock)
      const { data: adminSession } = await supabaseAdmin
        .from("support_sessions")
        .select("id, assigned_admin_id, mode")
        .eq("id", sessionId)
        .in("status", ["waiting", "active"])
        .maybeSingle();

      if (!adminSession) {
        return NextResponse.json({ error: "Session not found or closed" }, { status: 403 });
      }

      // Block admin messages on AI-only sessions
      if (adminSession.mode === "ai") {
        return NextResponse.json({ error: "Session is in AI mode — upgrade first" }, { status: 403 });
      }

      // Session owner lock: only the assigned admin can send messages
      if (adminSession.assigned_admin_id && adminSession.assigned_admin_id !== senderId) {
        return NextResponse.json({ error: "Session is assigned to another admin" }, { status: 403 });
      }

      // Rate limit per admin
      const now = Date.now();
      const lastMsg = rateLimitMap.get(senderId) || 0;
      if (now - lastMsg < RATE_LIMIT_MS) {
        return NextResponse.json({ error: "Too fast" }, { status: 429 });
      }
      rateLimitMap.set(senderId, now);
    }

    const { error } = await supabaseAdmin.from("support_messages").insert({
      session_id: sessionId,
      sender_type: senderType,
      sender_id: senderId,
      sender_name: senderName,
      message,
      ...(body.file_url ? { file_url: body.file_url } : {}),
      ...(body.file_type ? { file_type: body.file_type } : {}),
    });

    if (error) {
      return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
    }

    // Bump updated_at so the cleanup cron knows this session is still active
    await supabaseAdmin
      .from("support_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", sessionId);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
