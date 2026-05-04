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

    const { notificationId, action } = await req.json();

    if (!notificationId || !["accept", "dismiss"].includes(action)) {
      return NextResponse.json(
        { error: "notificationId and action (accept|dismiss) required" },
        { status: 400 },
      );
    }

    const nextStatus = action === "accept" ? "accepted" : "declined";

    const { data, error } = await supabaseAdmin
      .from("support_notifications")
      .update({ status: nextStatus })
      .eq("id", notificationId)
      .eq("to_admin_id", admin.userId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: "Notification not found or already handled" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, status: nextStatus });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
