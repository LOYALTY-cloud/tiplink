import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { sessionId, targetAdminId, targetAdminName } = await req.json();

    if (!sessionId || !targetAdminId) {
      return NextResponse.json({ error: "sessionId and targetAdminId required" }, { status: 400 });
    }

    // Only current owner can transfer
    const { data: session } = await supabaseAdmin
      .from("support_sessions")
      .select("id, assigned_admin_id, status, last_message")
      .eq("id", sessionId)
      .eq("status", "active")
      .maybeSingle();

    if (!session) {
      return NextResponse.json({ error: "Session not found or not active" }, { status: 404 });
    }

    if (session.assigned_admin_id !== admin.userId) {
      return NextResponse.json({ error: "Only the assigned admin can transfer" }, { status: 403 });
    }

    if (targetAdminId === admin.userId) {
      return NextResponse.json({ error: "Cannot transfer to yourself" }, { status: 400 });
    }

    // Resolve target admin name if not provided
    let resolvedName = targetAdminName;
    if (!resolvedName) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("display_name, handle")
        .eq("user_id", targetAdminId)
        .maybeSingle();
      resolvedName = profile?.display_name || profile?.handle || targetAdminId.slice(0, 8);
    }

    // Resolve sender admin name
    let fromName = "Admin";
    {
      const { data: fromProfile } = await supabaseAdmin
        .from("profiles")
        .select("display_name, handle")
        .eq("user_id", admin.userId)
        .maybeSingle();
      fromName = fromProfile?.display_name || fromProfile?.handle || "Admin";
    }

    // Create notification instead of instantly transferring
    const { data: notification, error: notifErr } = await supabaseAdmin
      .from("support_notifications")
      .insert({
        session_id: sessionId,
        from_admin_id: admin.userId,
        from_admin_name: fromName,
        to_admin_id: targetAdminId,
        type: "transfer_request",
        status: "pending",
        metadata: {
          target_admin_name: resolvedName,
          last_message: session.last_message,
        },
      })
      .select()
      .single();

    if (notifErr) {
      return NextResponse.json({ error: "Failed to create transfer request" }, { status: 500 });
    }

    // Audit
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: admin.userId,
      action: "support_transfer_request",
      metadata: {
        session_id: sessionId,
        notification_id: notification.id,
        from_admin: admin.userId,
        to_admin: targetAdminId,
        to_name: resolvedName,
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({ ok: true, notificationId: notification.id });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
