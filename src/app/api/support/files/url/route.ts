import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromSession } from "@/lib/auth/getAdminFromSession";
import { decodeSupportFileRef } from "@/lib/supportFiles";

export const runtime = "nodejs";

async function userCanAccessSupportFile(userId: string, ref: string) {
  const [{ data: supportMessage }, { data: ticketMessage }, { data: ticket }] = await Promise.all([
    supabaseAdmin.from("support_messages").select("session_id").eq("file_url", ref).limit(1).maybeSingle(),
    supabaseAdmin.from("support_ticket_messages").select("ticket_id").eq("file_url", ref).limit(1).maybeSingle(),
    supabaseAdmin.from("support_tickets").select("user_id").eq("file_url", ref).limit(1).maybeSingle(),
  ]);

  if (supportMessage?.session_id) {
    const { data: session } = await supabaseAdmin
      .from("support_sessions")
      .select("user_id")
      .eq("id", supportMessage.session_id)
      .maybeSingle();
    if (session?.user_id === userId) return true;
  }

  if (ticketMessage?.ticket_id) {
    const { data: ticketRow } = await supabaseAdmin
      .from("support_tickets")
      .select("user_id")
      .eq("id", ticketMessage.ticket_id)
      .maybeSingle();
    if (ticketRow?.user_id === userId) return true;
  }

  return ticket?.user_id === userId;
}

async function supportFileExists(ref: string) {
  const [{ data: supportMessage }, { data: ticketMessage }, { data: ticket }] = await Promise.all([
    supabaseAdmin.from("support_messages").select("id").eq("file_url", ref).limit(1).maybeSingle(),
    supabaseAdmin.from("support_ticket_messages").select("id").eq("file_url", ref).limit(1).maybeSingle(),
    supabaseAdmin.from("support_tickets").select("id").eq("file_url", ref).limit(1).maybeSingle(),
  ]);

  return !!supportMessage || !!ticketMessage || !!ticket;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ref = url.searchParams.get("ref");
  const path = decodeSupportFileRef(ref);

  if (!ref || !path) {
    return NextResponse.json({ error: "Invalid ref" }, { status: 400 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const adminId = req.headers.get("x-admin-id") ?? null;

  const admin = await getAdminFromSession(token, adminId);
  if (admin) {
    const exists = await supportFileExists(ref);
    if (!exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  } else {
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const allowed = await userCanAccessSupportFile(authData.user.id, ref);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { data, error } = await supabaseAdmin.storage
    .from("support-files")
    .createSignedUrl(path, 60 * 10);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Failed to create file URL" }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl });
}