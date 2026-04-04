import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

/** GET — check for pending transfer notifications for this admin */
export async function GET(req: Request) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data } = await supabaseAdmin
      .from("support_notifications")
      .select("*")
      .eq("to_admin_id", admin.userId)
      .eq("status", "pending")
      .eq("type", "transfer_request")
      .order("created_at", { ascending: false })
      .limit(1);

    return NextResponse.json({ notification: data?.[0] || null });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
