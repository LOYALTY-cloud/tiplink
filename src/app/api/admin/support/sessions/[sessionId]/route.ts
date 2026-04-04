import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { sessionId } = await params;

    const [sessionRes, messagesRes] = await Promise.all([
      supabaseAdmin
        .from("support_sessions")
        .select("*")
        .eq("id", sessionId)
        .single(),
      supabaseAdmin
        .from("support_messages")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true }),
    ]);

    if (sessionRes.error || !sessionRes.data) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({
      session: sessionRes.data,
      messages: messagesRes.data || [],
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
