import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

/** POST — upload file message from admin */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { sessionId } = await params;
    const { fileName, fileUrl, fileType, senderName } = await req.json();

    if (!fileUrl) {
      return NextResponse.json({ error: "fileUrl required" }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("support_messages").insert({
      session_id: sessionId,
      sender_type: "admin",
      sender_id: admin.userId,
      sender_name: senderName || "Admin",
      message: fileName || "File",
      file_url: fileUrl,
      file_type: fileType || null,
    });

    if (error) {
      return NextResponse.json({ error: "Failed to save message" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
