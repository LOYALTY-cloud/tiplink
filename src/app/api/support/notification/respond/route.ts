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

    const { notificationId, action, reason } = await req.json();

    if (!notificationId || !["accept", "decline"].includes(action)) {
      return NextResponse.json(
        { error: "notificationId and action (accept|decline) required" },
        { status: 400 }
      );
    }

    // Fetch notification — must be pending and addressed to this admin
    const { data: notification } = await supabaseAdmin
      .from("support_notifications")
      .select("*")
      .eq("id", notificationId)
      .eq("to_admin_id", admin.userId)
      .eq("status", "pending")
      .maybeSingle();

    if (!notification) {
      return NextResponse.json(
        { error: "Notification not found, already handled, or not for you" },
        { status: 404 }
      );
    }

    const now = new Date().toISOString();

    if (action === "decline") {
      // Mark declined with reason in metadata
      const safeReason = typeof reason === "string" ? reason.slice(0, 200) : "No reason given";
      await supabaseAdmin
        .from("support_notifications")
        .update({
          status: "declined",
          metadata: {
            ...notification.metadata,
            decline_reason: safeReason,
          },
        })
        .eq("id", notificationId);

      return NextResponse.json({ ok: true, status: "declined" });
    }

    // === ACCEPT ===

    // Verify session is still active
    const { data: session } = await supabaseAdmin
      .from("support_sessions")
      .select("id, status, assigned_admin_id")
      .eq("id", notification.session_id)
      .in("status", ["waiting", "active"])
      .maybeSingle();

    if (!session) {
      await supabaseAdmin
        .from("support_notifications")
        .update({ status: "expired" })
        .eq("id", notificationId);

      return NextResponse.json(
        { error: "Session is no longer available" },
        { status: 410 }
      );
    }

    // Resolve accepting admin's real name
    let adminName = "Admin";
    {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("first_name, last_name, display_name")
        .eq("user_id", admin.userId)
        .maybeSingle();
      adminName = profile?.first_name && profile?.last_name
        ? `${profile.first_name} ${profile.last_name}`
        : profile?.display_name || "Admin";
    }

    // Transfer the session
    const { error: transferErr } = await supabaseAdmin
      .from("support_sessions")
      .update({
        assigned_admin_id: admin.userId,
        assigned_admin_name: adminName,
        status: "active",
        updated_at: now,
      })
      .eq("id", notification.session_id);

    if (transferErr) {
      return NextResponse.json({ error: "Failed to accept transfer" }, { status: 500 });
    }

    // Mark notification accepted
    await supabaseAdmin
      .from("support_notifications")
      .update({ status: "accepted" })
      .eq("id", notificationId);

    // System message in the chat
    await supabaseAdmin.from("support_messages").insert({
      session_id: notification.session_id,
      sender_type: "admin",
      sender_id: null,
      sender_name: null,
      message: `↔️ Session transferred to ${adminName}`,
    });

    // Audit
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: admin.userId,
      action: "support_transfer_accepted",
      metadata: {
        session_id: notification.session_id,
        notification_id: notificationId,
        from_admin: notification.from_admin_id,
        to_admin: admin.userId,
        timestamp: now,
      },
    });

    return NextResponse.json({
      ok: true,
      status: "accepted",
      sessionId: notification.session_id,
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
