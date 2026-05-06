import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminFromRequest(req);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try { requireRole(session.role, ["owner", "super_admin"]); } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("application_notes")
    .select("id, note, admin_id, created_at")
    .eq("application_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("notes GET error:", error.message);
    return NextResponse.json({ error: "Failed to fetch notes." }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminFromRequest(req);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try { requireRole(session.role, ["owner", "super_admin"]); } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let body: { note?: unknown };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (!note || note.length > 2000) {
    return NextResponse.json({ error: "Note must be 1–2000 characters." }, { status: 422 });
  }

  const { data, error } = await supabaseAdmin
    .from("application_notes")
    .insert({ application_id: id, admin_id: session.userId, note })
    .select("id, note, admin_id, created_at")
    .single();

  if (error) {
    console.error("notes POST error:", error.message);
    return NextResponse.json({ error: "Failed to create note." }, { status: 500 });
  }

  return NextResponse.json(data);
}
