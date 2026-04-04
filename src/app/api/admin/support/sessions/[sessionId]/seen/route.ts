import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

/** POST — mark messages as seen by admin */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { sessionId } = await params;
    const now = new Date().toISOString();

    await supabaseAdmin
      .from("support_messages")
      .update({ seen_at: now })
      .eq("session_id", sessionId)
      .eq("sender_type", "user")
      .is("seen_at", null);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
