import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

/** POST — update typing indicator for admin */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { sessionId } = await params;
    const { typing } = await req.json();

    await supabaseAdmin.from("support_typing").upsert({
      session_id: sessionId,
      admin_id: admin.userId,
      admin_typing: !!typing,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
