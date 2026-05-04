import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { sendDisciplinaryNoticeEmail } from "@/lib/adminNotifications";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const adminId = typeof body?.adminId === "string" ? body.adminId : null;
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    const ticketId = typeof body?.ticketId === "string" ? body.ticketId : "";

    if (!adminId || !reason || !ticketId) {
      return NextResponse.json({ error: "adminId, reason, and ticketId are required" }, { status: 400 });
    }

    const { data: admin } = await supabaseAdmin
      .from("admins")
      .select("id, user_id, full_name")
      .eq("id", adminId)
      .maybeSingle();

    if (!admin?.user_id) return NextResponse.json({ ok: true });

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("user_id", admin.user_id)
      .maybeSingle();

    if (!profile?.email) return NextResponse.json({ ok: true });

    sendDisciplinaryNoticeEmail({
      to: profile.email,
      adminName: admin.full_name ?? "Admin",
      reason,
      ticketId,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
